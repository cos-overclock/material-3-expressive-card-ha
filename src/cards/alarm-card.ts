import { css, html, nothing } from 'lit';
import { M3eBaseCard, PressGesture, press, type BaseCardConfig } from './base-card';
import { hhmm, isUnavailable } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';

export interface AlarmCardConfig extends BaseCardConfig {
  /** alarm_control_panel entity. */
  entity: string;
  name?: string;
  icon?: string;
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

/**
 * Alarm panel: the state of an alarm_control_panel in a card tinted by its
 * tone (armed green, arming / pending yellow, triggered red, off neutral).
 * Tap opens HA's dialog, which arms and disarms (with the code if needed).
 *
 * Motion: the card and its shape re-tint on the effects spring; the shape
 * morphs circle (off) → cookie (armed) → burst (triggered) and turns slowly
 * while the alarm is arming, pending or triggered.
 */
export class M3eAlarmCard extends M3eBaseCard<AlarmCardConfig> {
  static override accentHint = '警備中の色を変えます。開始中・警報の色と、オフの無彩色は変わりません。';

  private gesture = new PressGesture(
    this,
    () => this.runAction(this.config.tap_action?.action ?? 'more-info', this.config.entity),
    () => this.runAction(this.config.hold_action?.action ?? 'more-info', this.config.entity),
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
        align-items: center;
        gap: 16px;
        height: 100%;
        padding: 16px 20px;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .card[data-accent='neutral'] {
        background: var(--m3-surface-container);
        color: var(--m3-on-surface);
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

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        gap: 12px;
        padding: 12px 14px;
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
      ],
    };
  }

  protected normalizeConfig(config: AlarmCardConfig): AlarmCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (!config.entity.startsWith('alarm_control_panel.')) throw new Error('entity must be an alarm_control_panel');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: this.compact ? 'auto' : 2, min_columns: 6 };
  }

  override getCardSize(): number {
    return 2;
  }

  protected override render() {
    const s = this.stateObj(this.config.entity);
    const [title, tone] = s ? (ALARM[s.state] ?? [s.state, 'off']) : ['見つかりません', 'off' as Tone];
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const by = s?.attributes.changed_by as string | undefined;
    const sub = [name, s && !isUnavailable(s) ? `${hhmm(s.last_changed)}から` : '', by ?? ''].filter(Boolean).join('・');
    const spin = s?.state === 'arming' || s?.state === 'pending' || s?.state === 'triggered';
    return html`<div
      class="card interactive ${this.gesture.pressed ? 'pressed' : ''} ${!s || isUnavailable(s) ? 'unavailable' : ''}"
      data-accent=${tone === 'ok' ? (this.config.color ?? TONE_ACCENT.ok) : TONE_ACCENT[tone]}
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
        ${sub ? html`<p class="sub">${sub}</p>` : nothing}
      </div>
    </div>`;
  }
}

define('m3e-alarm-card', M3eAlarmCard);
