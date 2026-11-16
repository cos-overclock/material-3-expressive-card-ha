import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { hhmm, isActive, isUnavailable, numState } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';
import '../components/m3e-switch';

interface Step {
  /** Value of the job-state entity during this step. */
  state: string | string[];
  name: string;
}

interface Stat {
  entity: string;
  name?: string;
  /** e.g. "あと {v}回分". Default: value and unit. */
  format?: string;
}

export interface LaundryCardConfig extends BaseCardConfig {
  /** The machine's job state (sensor / select), e.g. wash, rinse, spin, drying, finished. */
  entity: string;
  name?: string;
  icon?: string;
  /** switch for the power button. */
  power_entity?: string;
  /** Course / programme name. */
  course_entity?: string;
  /** When it will finish (timestamp sensor)… */
  completion_entity?: string;
  /** …or the minutes left. */
  remaining_entity?: string;
  /** Steps shown as segments. Default: 洗い / すすぎ / 脱水 / 乾燥. */
  steps?: Step[];
  /** States meaning "done". Default: finished, end, complete, done. */
  finished_states?: string[];
  /** Two tiles, e.g. power draw and detergent left. */
  stats?: (string | Stat)[];
  /** input_boolean / switch: notify when done. */
  notify_entity?: string;
  notify_label?: string;
}

const DEFAULT_STEPS: Step[] = [
  { state: ['wash', 'washing', 'weight_sensing', 'pre_wash', 'soak'], name: '洗い' },
  { state: ['rinse', 'rinsing'], name: 'すすぎ' },
  { state: ['spin', 'spinning'], name: '脱水' },
  { state: ['drying', 'dry', 'cooling', 'wrinkle_prevent'], name: '乾燥' },
];

const FINISHED = ['finished', 'end', 'complete', 'done'];
const IDLE = ['none', 'off', 'idle', 'stop', 'standby', 'ready', 'unavailable', 'unknown'];

const matches = (st: string | string[], value: string) => [st].flat().includes(value);

/**
 * Washing machine / washer-dryer: what it is doing and with which course, the
 * finish time and minutes left, the programme as segments (done, current,
 * still to come), two stats and a "tell me when it's done" switch.
 *
 * Motion: the cookie turns while running; the finish time rolls when it
 * shifts; the current segment fills with a slow travelling sheen; finished
 * segments fill on the effects spring; the power button rounds while pressed.
 */
export class M3eLaundryCard extends M3eBaseCard<LaundryCardConfig> {
  @state() private now = Date.now();
  private timer?: ReturnType<typeof setInterval>;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .header m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
        cursor: pointer;
      }
      [data-accent='neutral'] .header m3e-shape {
        --m3e-shape-color: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .text {
        flex: 1;
        min-width: 0;
        cursor: pointer;
      }
      .name {
        font: 500 16px / 20px var(--m3e-font-plain);
      }
      .state {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .power {
        width: 40px;
        height: 40px;
        border-radius: 20px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        --m3e-icon-size: 22px;
      }
      .power:active {
        border-radius: 12px;
      }
      [data-accent='neutral'] .power {
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .finish {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8px;
        padding: 0 4px;
      }
      .k {
        font: 500 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .time {
        font: 400 40px / 46px var(--m3e-font-brand);
        letter-spacing: -0.5px;
        font-variant-numeric: tabular-nums;
      }
      .done-text {
        font: 500 22px / 30px var(--m3e-font-plain);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 10px 0 8px;
        border-radius: 8px;
        margin-bottom: 6px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 12px / 1 var(--m3e-font-plain);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .chip m3e-icon {
        --m3e-icon-size: 16px;
      }
      .steps {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: 4px;
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .seg {
        position: relative;
        height: 6px;
        border-radius: 3px;
        background: var(--m3-surface-highest);
        overflow: hidden;
      }
      .seg i {
        position: absolute;
        inset: 0;
        border-radius: 3px;
        background: var(--accent-fill);
        transform-origin: left;
        transform: scaleX(0);
        transition: transform var(--m3e-effects-slow);
      }
      .step.done .seg i {
        transform: none;
      }
      .step.current .seg i {
        transform: scaleX(0.35);
      }
      .step.current .seg::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent-fill) 55%, transparent), transparent);
        animation: sheen 2.4s ease-in-out infinite;
      }
      @keyframes sheen {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(100%);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .step.current .seg::after {
          animation: none;
          display: none;
        }
      }
      .step span {
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .step.current span {
        font-weight: 500;
        color: var(--m3-on-surface);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 8px;
      }
      .stat {
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        cursor: pointer;
      }
      .stat .v {
        font: 400 18px / 26px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .notify {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 52px;
        padding: 0 12px 0 16px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        font: 400 13px / 18px var(--m3e-font-plain);
      }
      .notify m3e-icon {
        --m3e-icon-size: 20px;
        color: var(--m3-on-surface-variant);
      }
      .notify span {
        flex: 1;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .header {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 15px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .state {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .power {
        width: 36px;
        height: 36px;
        --m3e-icon-size: 20px;
      }
      :host([compact]) .time {
        font: 400 32px / 38px var(--m3e-font-brand);
      }
      :host([compact]) .done-text {
        font: 500 18px / 26px var(--m3e-font-plain);
      }
      :host([compact]) .step {
        gap: 6px;
      }
      :host([compact]) .stat {
        padding: 8px 12px;
      }
      :host([compact]) .stat .v {
        font: 400 16px / 22px var(--m3e-font-brand);
      }
      :host([compact]) .notify {
        min-height: 44px;
        padding: 0 10px 0 12px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => /washer|laundry|sentaku/.test(id)) ?? 'sensor.washer_job_state';
    return { type: 'custom:m3e-laundry-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: {} } },
        { name: 'name', selector: { text: {} } },
        { name: 'power_entity', selector: { entity: { domain: 'switch' } } },
        { name: 'course_entity', selector: { entity: {} } },
        { name: 'completion_entity', selector: { entity: { domain: 'sensor', device_class: 'timestamp' } } },
        { name: 'remaining_entity', selector: { entity: { domain: 'sensor' } } },
        { name: 'notify_entity', selector: { entity: { domain: ['input_boolean', 'switch'] } } },
      ],
    };
  }

  protected normalizeConfig(config: LaundryCardConfig): LaundryCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  private stats(): Stat[] {
    return (this.config.stats ?? []).map((s) => (typeof s === 'string' ? { entity: s } : s));
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    return [c.entity, c.power_entity, c.course_entity, c.completion_entity, c.remaining_entity, c.notify_entity, ...this.stats().map((s) => s.entity)].filter(
      Boolean,
    ) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'lavender';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 6;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => (this.now = Date.now()), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }

  /** Finish time (ms) from the timestamp sensor or the minutes left. */
  private finishAt(): number | undefined {
    const ts = Date.parse(this.stateObj(this.config.completion_entity)?.state ?? '');
    if (Number.isFinite(ts)) return ts;
    const rem = this.stateObj(this.config.remaining_entity);
    const v = numState(rem);
    if (v === undefined) return undefined;
    const unit = String(rem!.attributes.unit_of_measurement ?? 'min');
    const min = unit === 's' ? v / 60 : unit === 'h' ? v * 60 : v;
    return Date.parse(rem!.last_updated) + min * 60_000;
  }

  private statValue(st: Stat): string {
    const s = this.stateObj(st.entity);
    if (!s || isUnavailable(s)) return '—';
    if (st.format) return st.format.replace('{v}', s.state);
    const unit = s.attributes.unit_of_measurement as string | undefined;
    return unit ? `${s.state} ${unit}` : s.state;
  }

  protected override render() {
    const c = this.config;
    const s = this.stateObj(c.entity);
    const job = s?.state ?? 'unavailable';
    const steps = c.steps ?? DEFAULT_STEPS;
    const current = steps.findIndex((st) => matches(st.state, job));
    const finished = (c.finished_states ?? FINISHED).includes(job);
    const idle = IDLE.includes(job);
    const running = !finished && !idle;
    const course = this.stateObj(c.course_entity)?.state;
    const stepName = current >= 0 ? `${steps[current].name}中` : running ? '運転中' : finished ? '終了' : '停止中';
    const statusLine = [stepName, running && course && !isUnavailable(this.stateObj(c.course_entity)) ? course : ''].filter(Boolean).join('・');
    const at = this.finishAt();
    const left = at !== undefined ? Math.max(0, Math.round((at - this.now) / 60_000)) : undefined;
    const power = this.stateObj(c.power_entity);
    const notify = this.stateObj(c.notify_entity);
    const name = c.name ?? (s?.attributes.friendly_name as string) ?? c.entity;
    const stats = this.stats();
    return html`<div class="card ${isUnavailable(s) ? 'unavailable' : ''}" data-accent=${running || finished ? nothing : 'neutral'}>
      <div class="header">
        <m3e-shape .shape=${running ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?spin=${running} @click=${() => this.moreInfo(c.entity)}>
          <m3e-icon .icon=${c.icon ?? 'local-laundry-service'}></m3e-icon>
        </m3e-shape>
        <div class="text" @click=${() => this.moreInfo(c.entity)}>
          <p class="name">${name}</p>
          <p class="state">${statusLine}</p>
        </div>
        ${power
          ? html`<button
              class="icon-btn power"
              aria-label=${isActive(power) ? '電源を切る' : '電源を入れる'}
              aria-pressed=${isActive(power) ? 'true' : 'false'}
              ?disabled=${isUnavailable(power)}
              @click=${() => this.call('homeassistant', isActive(power) ? 'turn_off' : 'turn_on', {}, power.entity_id)}
            >
              <m3e-icon icon="power-settings-new"></m3e-icon>
            </button>`
          : nothing}
      </div>

      ${running && at !== undefined
        ? html`<div class="finish">
            <div>
              <p class="k">終了予定</p>
              <p class="time"><m3e-rolling-text .text=${hhmm(at)}></m3e-rolling-text></p>
            </div>
            <span class="chip"><m3e-icon icon="timer"></m3e-icon>あと ${left}分</span>
          </div>`
        : finished
          ? html`<div class="finish">
              <div>
                <p class="k">終わりました</p>
                <p class="done-text">${hhmm(s!.last_changed)} に終了</p>
              </div>
            </div>`
          : nothing}
      ${running || finished
        ? html`<div class="steps" role="list" aria-label="工程">
            ${steps.map((st, i) => {
              const cls = finished || i < current ? 'done' : i === current ? 'current' : '';
              return html`<div class="step ${cls}" role="listitem" aria-current=${i === current ? 'step' : nothing}>
                <div class="seg"><i></i></div>
                <span>${st.name}</span>
              </div>`;
            })}
          </div>`
        : nothing}
      ${stats.length
        ? html`<div class="stats">
            ${stats.map(
              (st) => html`<div class="stat" @click=${() => this.moreInfo(st.entity)}>
                <p class="k">${st.name ?? this.stateObj(st.entity)?.attributes.friendly_name ?? st.entity}</p>
                <p class="v">${this.statValue(st)}</p>
              </div>`,
            )}
          </div>`
        : nothing}
      ${notify
        ? html`<div class="notify" data-accent=${c.color ?? 'lavender'}>
            <m3e-icon icon="notifications-active"></m3e-icon>
            <span>${c.notify_label ?? '終わったら知らせる'}</span>
            <m3e-switch
              .checked=${isActive(notify)}
              ?disabled=${isUnavailable(notify)}
              label=${c.notify_label ?? '終わったら知らせる'}
              @change=${() => this.call('homeassistant', isActive(notify) ? 'turn_off' : 'turn_on', {}, notify.entity_id)}
            ></m3e-switch>
          </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-laundry-card', M3eLaundryCard);
