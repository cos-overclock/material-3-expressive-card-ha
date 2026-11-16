import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, actionsSection, press, PressGesture, type BaseCardConfig } from './base-card';
import { fireHaptic, hhmm, isUnavailable } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-keypad';

type ArmMode = 'arm_home' | 'arm_away' | 'arm_night' | 'arm_vacation' | 'arm_custom_bypass';

export interface AlarmCardConfig extends BaseCardConfig {
  /** alarm_control_panel entity. */
  entity: string;
  name?: string;
  icon?: string;
  /**
   * Arm / disarm buttons on the card (with a keypad when the panel wants a
   * code). Default false: the card is one button that opens HA's dialog.
   */
  show_actions?: boolean;
  /** Which arm buttons to offer, in order. Default: every mode the panel supports. */
  modes?: ArmMode[];
}

type Tone = 'ok' | 'alert' | 'busy' | 'off';

const ALARM: Record<string, [title: string, tone: Tone]> = {
  armed_home: ['警備中（在宅）', 'ok'],
  armed_away: ['警備中（外出）', 'ok'],
  armed_night: ['警備中（就寝）', 'ok'],
  armed_vacation: ['警備中（長期不在）', 'ok'],
  armed_custom_bypass: ['警備中（カスタム）', 'ok'],
  arming: ['警備を開始しています', 'busy'],
  pending: ['まもなく警報', 'busy'],
  disarming: ['警備を解除しています', 'busy'],
  triggered: ['警報が鳴っています', 'alert'],
  disarmed: ['警備オフ', 'off'],
  unavailable: ['利用不可', 'off'],
  unknown: ['不明', 'off'],
};

const TONE_ACCENT: Record<Tone, Accent | 'neutral'> = { ok: 'green', alert: 'red', busy: 'yellow', off: 'neutral' };

/** AlarmControlPanelEntityFeature bit, label and icon per arm mode. */
const MODES: Record<ArmMode, { bit: number; label: string; icon: string }> = {
  arm_home: { bit: 1, label: '在宅', icon: 'home' },
  arm_away: { bit: 2, label: '外出', icon: 'directions-walk' },
  arm_night: { bit: 4, label: '就寝', icon: 'bedtime' },
  arm_custom_bypass: { bit: 16, label: 'カスタム', icon: 'tune' },
  arm_vacation: { bit: 32, label: '長期不在', icon: 'flight' },
};
const MODE_ORDER: ArmMode[] = ['arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'];

type Service = ArmMode | 'disarm';

/**
 * Alarm panel: the state of an alarm_control_panel in a card tinted by its
 * tone (armed green, arming / pending yellow, triggered red, off neutral).
 * Tap opens HA's dialog. With `show_actions`, arm / disarm buttons sit under
 * the state, and a keypad opens when the panel needs a code.
 *
 * Motion: the card and its shape re-tint on the effects spring; the shape
 * morphs circle (off) → cookie (armed) → burst (triggered) and turns slowly
 * while the alarm is arming, pending or triggered; the keypad unfolds on the
 * default spatial spring and shakes on a wrong code.
 */
export class M3eAlarmCard extends M3eBaseCard<AlarmCardConfig> {
  static override accentHint = '警備中の色を変えます。開始中・警報の色と、オフの無彩色は変わりません。';

  /** The command waiting for its code. */
  @state() private pending?: Service;
  @state() private error = '';

  private gesture = new PressGesture(
    this,
    () => this.handleAction('tap', 'more-info'),
    () => this.handleAction('hold', 'more-info'),
    this.doubleTap,
  );

  static override styles = [
    M3eBaseCard.styles,
    css`
      /* Fill the grid rows HA gives the card (2 rows in the comfortable density). */
      :host {
        height: 100%;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .card[data-accent='neutral'] {
        background: var(--m3-surface-container);
        color: var(--m3-on-surface);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;
        padding: 16px 20px;
        border-radius: inherit;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: transform var(--m3e-spatial-fast);
      }
      .with-actions .head {
        flex: none;
        padding-bottom: 0;
      }
      .head.pressed {
        transform: scale(0.97);
      }
      .head:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: -2px;
      }
      m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        --m3e-icon-size: 28px;
      }
      [data-accent='neutral'] m3e-shape {
        --m3e-shape-color: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .text {
        flex: 1;
        min-width: 0;
      }
      .title {
        font: 600 16px / 24px var(--m3e-font-plain);
      }
      .sub {
        font: 400 13px / 20px var(--m3e-font-plain);
        opacity: 0.9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .actions {
        display: flex;
        gap: 6px;
        padding: 0 16px 16px;
      }
      .act {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        height: 56px;
        border-radius: 14px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 12px / 16px var(--m3e-font-plain);
        --m3e-icon-size: 22px;
      }
      [data-accent]:not([data-accent='neutral']) .act {
        background: color-mix(in srgb, var(--accent-on-container) 10%, transparent);
        color: inherit;
      }
      .act.disarm {
        flex-direction: row;
        gap: 8px;
        font: 500 15px / 20px var(--m3e-font-plain);
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      [data-accent]:not([data-accent='neutral']) .act.disarm {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .act:active {
        border-radius: 28px;
        transform: none;
      }
      .act[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .fold {
        display: grid;
        grid-template-rows: 0fr;
        margin-top: -12px;
        transition:
          grid-template-rows var(--m3e-spatial-default),
          margin-top var(--m3e-spatial-default);
      }
      .fold.open {
        grid-template-rows: 1fr;
        margin-top: 0;
      }
      .fold > div {
        min-height: 0;
        overflow: hidden;
        padding: 0 16px;
      }
      .fold.open > div {
        padding-bottom: 16px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .head {
        gap: 12px;
        padding: 12px 14px;
      }
      :host([compact]) .with-actions .head {
        padding-bottom: 0;
      }
      :host([compact]) m3e-shape {
        --m3e-icon-size: 24px;
      }
      :host([compact]) .title {
        font: 600 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .actions {
        padding: 0 12px 12px;
      }
      :host([compact]) .act {
        height: 48px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('alarm_control_panel.')) ?? 'alarm_control_panel.example';
    return { type: 'custom:m3e-alarm-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'alarm_control_panel' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'show_actions', selector: { boolean: {} } },
        {
          name: 'modes',
          selector: {
            select: {
              multiple: true,
              mode: 'list',
              options: MODE_ORDER.map((m) => ({ value: m, label: MODES[m].label })),
            },
          },
        },
        actionsSection(),
      ],
      computeLabel: (s: { name: string }) => ({ show_actions: '警備の開始・解除ボタンを表示', modes: '開始ボタンの種類（省略で対応するすべて）' })[s.name],
    };
  }

  protected normalizeConfig(config: AlarmCardConfig): AlarmCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (!config.entity.startsWith('alarm_control_panel.')) throw new Error('entity must be an alarm_control_panel');
    const bad = config.modes?.find((m) => !MODE_ORDER.includes(m));
    if (bad) throw new Error(`modes: ${bad} is not one of ${MODE_ORDER.join(', ')}`);
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  override getGridOptions(): LovelaceGridOptions {
    if (this.config.show_actions) return { columns: 12, rows: 'auto', min_columns: 6 };
    return { columns: 12, rows: this.compact ? 'auto' : 2, min_columns: 6 };
  }

  override getCardSize(): number {
    return this.config.show_actions ? 4 : 2;
  }

  private attr(name: string): unknown {
    return this.stateObj(this.config.entity)?.attributes[name];
  }

  /** Whether `service` needs a code typed on the card. */
  private needsCode(service: Service): boolean {
    if (!this.attr('code_format')) return false;
    if (service === 'disarm') return true;
    return this.attr('code_arm_required') !== false;
  }

  private request(service: Service): void {
    this.error = '';
    if (this.needsCode(service)) {
      this.pending = service;
      this.keypad?.clear();
      this.updateComplete.then(() => this.keypad?.focus());
      return;
    }
    this.send(service);
  }

  private async send(service: Service, code?: string): Promise<void> {
    try {
      await this.hass?.callService('alarm_control_panel', `alarm_${service}`, code ? { code } : {}, { entity_id: this.config.entity });
      fireHaptic(this, 'success');
      this.pending = undefined;
      this.keypad?.clear();
    } catch (e) {
      fireHaptic(this, 'failure');
      this.error = (e as Error)?.message || '操作できませんでした';
      this.keypad?.clear();
      this.keypad?.shake();
    }
  }

  private get keypad() {
    return this.renderRoot?.querySelector('m3e-keypad') ?? undefined;
  }

  private armModes(): ArmMode[] {
    const features = Number(this.attr('supported_features') ?? 0);
    // Without supported_features (template panels), offer home and away.
    const supported = (m: ArmMode) => (this.attr('supported_features') === undefined ? m === 'arm_home' || m === 'arm_away' : !!(features & MODES[m].bit));
    return (this.config.modes ?? MODE_ORDER).filter(supported);
  }

  private renderActions(state: string, off: boolean) {
    const armed = state !== 'disarmed';
    const verb = this.pending === 'disarm' ? '警備を解除' : this.pending ? `警備（${MODES[this.pending].label}）を開始` : '';
    return html`<div class="actions">
        ${armed
          ? html`<button class="icon-btn act disarm" ?disabled=${off || state === 'disarming'} @click=${() => this.request('disarm')}>
              <m3e-icon icon="lock-open"></m3e-icon>警備を解除
            </button>`
          : this.armModes().map(
              (m) => html`<button class="icon-btn act" ?disabled=${off} aria-label="警備を開始（${MODES[m].label}）" @click=${() => this.request(m)}>
                <m3e-icon .icon=${MODES[m].icon}></m3e-icon>${MODES[m].label}
              </button>`,
            )}
      </div>
      <div class="fold ${this.pending ? 'open' : ''}" ?inert=${!this.pending}>
        <div>
          <m3e-keypad
            .verb=${verb}
            .numeric=${this.attr('code_format') !== 'text'}
            .error=${this.error}
            ?compact=${this.compact}
            @pin-input=${() => (this.error = '')}
            @pin-submit=${(e: CustomEvent<{ code: string }>) => this.pending && this.send(this.pending, e.detail.code)}
            @pin-cancel=${() => {
              this.pending = undefined;
              this.error = '';
            }}
          ></m3e-keypad>
        </div>
      </div>`;
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    const [title, tone] = s ? (ALARM[s.state] ?? [s.state, 'off']) : ['見つかりません', 'off' as Tone];
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const by = s?.attributes.changed_by as string | undefined;
    const off = !s || isUnavailable(s);
    const error = this.error && !this.pending ? this.error : '';
    const sub = error || [name, s && !off ? `${hhmm(s.last_changed)}から` : '', by ?? ''].filter(Boolean).join('・');
    const spin = s?.state === 'arming' || s?.state === 'pending' || s?.state === 'triggered';
    const actions = !!this.config.show_actions;
    return html`<div
      class="card ${actions ? 'with-actions' : ''} ${off ? 'unavailable' : ''}"
      data-accent=${tone === 'ok' ? (this.config.color ?? TONE_ACCENT.ok) : TONE_ACCENT[tone]}
    >
      <div
        class="head ${this.gesture.pressed ? 'pressed' : ''}"
        role="button"
        tabindex="0"
        aria-label="${name}：${title}"
        ${press(this.gesture)}
      >
        <m3e-shape .shape=${tone === 'off' ? 'circle' : tone === 'alert' ? 'burst8' : 'cookie12'} size=${this.compact ? 44 : 56} ?spin=${spin}>
          <m3e-icon .icon=${this.config.icon ?? 'shield'}></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="title">${title}</p>
          ${sub ? html`<p class="sub" role=${error ? 'alert' : nothing}>${sub}</p>` : nothing}
        </div>
      </div>
      ${actions && s ? this.renderActions(s.state, off) : nothing}
    </div>`;
  }
}

define('m3e-alarm-card', M3eAlarmCard);
