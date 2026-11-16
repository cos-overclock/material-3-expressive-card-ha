import { css, html, nothing, type PropertyValues } from 'lit';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { checkEntity, type Issue } from '../editor/validate';
import { richCardStyles } from './shared-styles';
import { fireHaptic, isUnavailable } from '../ha/helpers';
import { formatDuration, hms, parseDuration, presetLabel } from '../ha/duration';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-wavy-progress';
import '../components/m3e-rolling-text';

export interface TimerCardConfig extends BaseCardConfig {
  /** timer.* (a timer helper). */
  entity: string;
  name?: string;
  icon?: string;
  /** Quick-start durations: '3:00', '10:00', '1:00:00' (h:mm:ss or m:ss), or minutes as a number. */
  presets?: (string | number)[];
  /** Show "+1分" while running (timer.change). Default true. */
  show_add?: boolean;
}

/**
 * Kitchen / bath timer for a timer helper: the time left in large digits, a
 * wavy bar that empties as it runs, start / pause / cancel, quick presets and
 * "+1分".
 *
 * Motion: the digits roll each second; the wave travels while running and
 * flattens when paused; the shape turns while running.
 */
export class M3eTimerCard extends M3eBaseCard<TimerCardConfig> {
  static override styles = [
    M3eBaseCard.styles,
    richCardStyles,
    css`
      .time {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .time .big {
        font-size: 64px;
        line-height: 68px;
      }
      .time .sub {
        font: 500 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .act {
        flex: 1 1 0;
        height: 52px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font: 500 15px / 1 var(--m3e-font-plain);
        --m3e-icon-size: 22px;
      }
      .act.primary {
        flex-grow: 1.6;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .act:active {
        border-radius: 26px;
      }
      :host([compact]) .time .big {
        font-size: 48px;
        line-height: 52px;
      }
      :host([compact]) .act {
        height: 44px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('timer.')) ?? 'timer.example';
    return { type: 'custom:m3e-timer-card', entity, presets: ['3:00', '5:00', '10:00'] };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'timer' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'presets', selector: { text: { multiple: true } } },
        { name: 'show_add', default: true, selector: { boolean: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) => ({ presets: 'すぐ始める時間（例 3:00）', show_add: '「+1分」を表示' })[s.name],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    return checkEntity(c, 'entity', ['timer'], 'タイマー', true);
  }

  protected normalizeConfig(config: TimerCardConfig): TimerCardConfig {
    if (!config.entity) throw new Error('entity is required');
    for (const p of config.presets ?? []) {
      if (parseDuration(p) === undefined) throw new Error(`presets: "${p}" is not a duration like 3:00`);
    }
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  protected override defaultAccent(): Accent {
    return 'peach';
  }

  /** Tick every second only while the timer runs. */
  protected override clockInterval(): number {
    return this.stateObj(this.config.entity)?.state === 'active' ? 1000 : 0;
  }

  private wasActive = false;

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const active = this.stateObj(this.config.entity)?.state === 'active';
    if (active !== this.wasActive) {
      this.wasActive = active;
      this.restartClock();
    }
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 5;
  }

  /** Seconds left: from finishes_at while running, else the remaining / duration attribute. */
  private remaining(s: HassEntity): number {
    const a = s.attributes;
    if (s.state === 'active' && a.finishes_at) return Math.max(0, (Date.parse(a.finishes_at) - this.clockNow) / 1000);
    if (s.state === 'paused') return parseDuration(a.remaining) ?? 0;
    return parseDuration(a.duration) ?? 0;
  }

  private svc(service: string, data: Record<string, unknown> = {}): void {
    fireHaptic(this, 'light');
    this.call('timer', service, data, this.config.entity);
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    if (!s) return html`<div class="card unavailable"></div>`;
    const off = isUnavailable(s);
    const st = s.state;
    const running = st === 'active';
    const paused = st === 'paused';
    const total = parseDuration(s.attributes.duration) ?? 0;
    const left = this.remaining(s);
    const name = this.config.name ?? (s.attributes.friendly_name as string | undefined) ?? this.config.entity;
    const presets = (this.config.presets ?? []).map((p) => parseDuration(p)!).filter((v) => v > 0);
    const endsAt = running && s.attributes.finishes_at ? new Date(s.attributes.finishes_at) : undefined;
    const sub = running && endsAt ? `${endsAt.getHours()}:${String(endsAt.getMinutes()).padStart(2, '0')} に終了` : paused ? '一時停止中' : total ? `設定 ${presetLabel(total)}` : '待機中';
    return html`<div class="card ${off ? 'unavailable' : ''}">
      <div class="header">
        <div class="tap" @click=${() => this.tapEntity(this.config.entity)}>
          <m3e-shape .shape=${running ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?spin=${running}>
            <m3e-icon .icon=${this.config.icon ?? (paused ? 'timer-pause' : 'timer')}></m3e-icon>
          </m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${off ? '利用不可' : running ? '計測中' : paused ? '一時停止中' : '待機中'}</p>
          </div>
        </div>
      </div>

      <div class="time" role="timer" aria-live="off">
        <span class="big"><m3e-rolling-text .text=${formatDuration(left)}></m3e-rolling-text></span>
        <span class="sub">${sub}</span>
      </div>
      <m3e-wavy-progress .value=${total ? left / total : 0} ?playing=${running} label="残り時間" .valueText=${formatDuration(left)}></m3e-wavy-progress>

      <div class="actions">
        ${running
          ? html`<button class="icon-btn act primary" ?disabled=${off} @click=${() => this.svc('pause')}><m3e-icon icon="pause"></m3e-icon>一時停止</button>`
          : html`<button class="icon-btn act primary" ?disabled=${off || (!paused && !total)} @click=${() => this.svc('start')}>
              <m3e-icon icon="play-arrow"></m3e-icon>${paused ? '再開' : 'スタート'}
            </button>`}
        ${running && this.config.show_add !== false
          ? html`<button class="icon-btn act" @click=${() => this.svc('change', { duration: '0:01:00' })}>+1分</button>`
          : nothing}
        <button class="icon-btn act" aria-label="取り消す" ?disabled=${off || (!running && !paused)} @click=${() => this.svc('cancel')}>
          <m3e-icon icon="restart-alt"></m3e-icon>
        </button>
      </div>

      ${presets.length
        ? html`<div class="chips" role="group" aria-label="すぐ始める">
            ${presets.map(
              (sec) => html`<button class="chip ${!running && !paused && sec === total ? 'on' : ''}" ?disabled=${off} @click=${() => this.svc('start', { duration: hms(sec) })}>
                <m3e-icon icon="hourglass-top"></m3e-icon><span>${presetLabel(sec)}</span>
              </button>`,
            )}
          </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-timer-card', M3eTimerCard);
