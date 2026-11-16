import { css, html, nothing, type PropertyValues } from 'lit';
import { M3eBaseCard, PressGesture, press, type BaseCardConfig } from './base-card';
import { DEVICE, levelFor, sensorLevels, type SensorLevel } from './sensor-card';
import { defaultAccentFor, defaultIconFor } from '../ha/domain';
import { domainOf, isUnavailable } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';

export interface ValueCardConfig extends BaseCardConfig {
  entity: string;
  /** Show this attribute instead of the state. */
  attribute?: string;
  name?: string;
  icon?: string;
  /** auto (default): boolean for on/off-like values, number for numeric ones, else text. */
  kind?: 'auto' | 'boolean' | 'number';
  /** tile (default, 2 rows) | row (1 row, for lists) | mini (1 row, a third of the width). */
  layout?: ValueLayout;
  /** Boolean labels; default from the device class (開 / 閉, 検知 / なし…). */
  on_text?: string;
  off_text?: string;
  /** Number: fixed decimals. Default from the entity's display precision, else as reported. */
  decimals?: number;
  /** Number: unit override. Default the entity's unit (state only). */
  unit?: string;
  /** Number: draw a bar between min and max (tile layout). */
  min?: number;
  max?: number;
  /** Number: status chip and colour from the value, as in the sensor card. */
  levels?: SensorLevel[];
}

type Kind = 'boolean' | 'number' | 'text';
export type ValueLayout = 'tile' | 'row' | 'mini';
const LAYOUTS: ValueLayout[] = ['tile', 'row', 'mini'];

const ON_VALUES = new Set(['on', 'true', 'yes', 'open', 'detected']);
const BOOL_VALUES = new Set([...ON_VALUES, 'off', 'false', 'no', 'closed', 'clear']);
const BOOL_DOMAINS = new Set(['binary_sensor', 'input_boolean', 'switch']);

/** binary_sensor device class → [on label, off label, accent, icon]. */
const BOOL_CLASS: Record<string, [string, string, Accent, string]> = {
  door: ['開', '閉', 'peach', 'door-front'],
  garage_door: ['開', '閉', 'peach', 'garage-door'],
  window: ['開', '閉', 'peach', 'window'],
  opening: ['開', '閉', 'peach', 'sensor-door'],
  lock: ['解錠', '施錠', 'peach', 'lock-open-right'],
  motion: ['検知', 'なし', 'yellow', 'motion-sensor-active'],
  occupancy: ['検知', 'なし', 'yellow', 'motion-sensor-active'],
  presence: ['在宅', '不在', 'green', 'home'],
  sound: ['検知', 'なし', 'yellow', 'volume-up'],
  vibration: ['検知', 'なし', 'yellow', 'sensors'],
  moving: ['動作中', '停止', 'teal', 'sensors'],
  running: ['動作中', '停止', 'teal', 'power-settings-new'],
  connectivity: ['接続', '切断', 'green', 'devices'],
  plug: ['接続', '未接続', 'green', 'electric-bolt'],
  power: ['オン', 'オフ', 'yellow', 'electric-bolt'],
  light: ['明るい', '暗い', 'yellow', 'sunny'],
  heat: ['高温', '正常', 'peach', 'heat'],
  cold: ['低温', '正常', 'sky', 'ac-unit'],
  battery: ['低下', '正常', 'red', 'battery-full'],
  battery_charging: ['充電中', '充電なし', 'green', 'battery-full'],
  moisture: ['漏水', '正常', 'red', 'water-drop'],
  problem: ['異常', '正常', 'red', 'notifications-active'],
  safety: ['危険', '安全', 'red', 'shield'],
  smoke: ['検知', '正常', 'red', 'local-fire-department'],
  gas: ['検知', '正常', 'red', 'local-fire-department'],
  carbon_monoxide: ['検知', '正常', 'red', 'local-fire-department'],
  tamper: ['検知', '正常', 'red', 'shield'],
  update: ['更新あり', '最新', 'blue', 'notifications-active'],
};

/**
 * A single value, kept simple: a boolean (オン / オフ, 開 / 閉…) or a number
 * with its unit.
 *
 *  tile  icon and name on top, the value large below; numbers can add a
 *        min–max bar. A true boolean fills the card with the accent container.
 *  row   one line for lists: icon, name, then the value on the right. A
 *        boolean shows as a pill that takes the accent when true.
 *  mini  one row in a third of the section, for packing several readings
 *        under a heading: icon and name small on top, the value below. A
 *        true boolean fills the card; levels tint the icon; min–max draws a
 *        thin bar under the value.
 *
 * Motion: the value rolls when it changes (up for larger numbers); the card,
 * pill and bar re-tint on the effects spring; the bar grows on the spatial one.
 */
export class M3eValueCard extends M3eBaseCard<ValueCardConfig> {
  private gesture = new PressGesture(
    this,
    () => this.runAction(this.config.tap_action?.action ?? 'more-info', this.config.entity),
    () => this.runAction(this.config.hold_action?.action ?? 'more-info', this.config.entity),
  );

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        height: 100%;
        color: var(--m3-on-surface);
      }
      m3e-icon {
        --m3e-icon-size: 18px;
        color: var(--accent-fill);
        flex: none;
        transition: color var(--m3e-effects-default);
      }
      .name {
        flex: 1;
        min-width: 0;
        font: 400 14px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color var(--m3e-effects-default);
      }
      .value {
        display: flex;
        /* The rolling text's first span is the (usually empty) outgoing value,
           so take the baseline from its last span, the current one. */
        align-items: last baseline;
        gap: 4px;
        min-width: 0;
        font-family: var(--m3e-font-brand);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .value m3e-rolling-text {
        min-width: 0;
      }
      .unit {
        font-weight: 400;
        color: var(--m3-on-surface-variant);
        letter-spacing: 0;
        transition: color var(--m3e-effects-default);
      }
      .chip {
        padding: 2px 8px;
        border-radius: 8px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 12px / 16px var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }

      /* tile */
      .tile {
        min-height: 120px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
      }
      .tile .top {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
      }
      .tile .value {
        font-size: 30px;
        line-height: 36px;
        letter-spacing: -0.5px;
      }
      .tile .unit {
        font-size: 15px;
        line-height: 20px;
      }
      .tile.text .value {
        font-size: 22px;
        line-height: 30px;
        letter-spacing: 0;
      }
      .tile.on,
      .mini.on {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .tile.on m3e-icon,
      .tile.on .name,
      .mini.on m3e-icon,
      .mini.on .name {
        color: var(--accent-on-container);
      }
      .bar {
        height: 4px;
        border-radius: 2px;
        background: var(--accent-track);
        overflow: hidden;
        transition: background-color var(--m3e-effects-default);
      }
      .bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--accent-fill);
        transition:
          width var(--m3e-spatial-default),
          background-color var(--m3e-effects-default);
      }
      .tile .stack {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* row */
      .row {
        height: 100%;
        min-height: 56px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .row m3e-icon {
        --m3e-icon-size: 20px;
      }
      .row .name {
        color: var(--m3-on-surface);
        font-size: 15px;
        line-height: 22px;
      }
      .row .value {
        flex: none;
        max-width: 55%;
        font-size: 16px;
        line-height: 24px;
      }
      .row .unit {
        font-size: 13px;
      }
      .pill {
        flex: none;
        padding: 4px 12px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface-variant);
        font: 500 13px / 18px var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .pill.on {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .off m3e-icon {
        color: var(--m3-on-surface-variant);
      }

      /* mini: 56px tall, a third of the section */
      .mini {
        height: 100%;
        min-height: 56px;
        padding: 6px 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1px;
      }
      .mini .top {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      .mini m3e-icon {
        --m3e-icon-size: 16px;
      }
      .mini .name {
        font-size: 12px;
        line-height: 16px;
      }
      .mini .value {
        font-size: 18px;
        line-height: 24px;
        letter-spacing: -0.2px;
      }
      .mini .unit {
        font-size: 12px;
        line-height: 16px;
      }
      .mini.text .value,
      .mini.boolean .value {
        font: 500 15px / 24px var(--m3e-font-plain);
        letter-spacing: 0;
      }
      .mini .bar {
        height: 3px;
        border-radius: 1.5px;
        margin-top: 2px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, { state: string }> }) {
    const entity =
      Object.keys(hass.states).find((id) => id.startsWith('binary_sensor.')) ??
      Object.keys(hass.states).find((id) => id.startsWith('sensor.') && Number.isFinite(Number(hass.states[id].state))) ??
      'binary_sensor.example';
    return { type: 'custom:m3e-value-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: {} } },
        { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'layout', selector: { select: { options: LAYOUTS } } },
        { name: 'kind', selector: { select: { options: ['auto', 'boolean', 'number'] } } },
        { name: 'on_text', selector: { text: {} } },
        { name: 'off_text', selector: { text: {} } },
        { name: 'unit', selector: { text: {} } },
        { name: 'decimals', selector: { number: { min: 0, max: 6, mode: 'box' } } },
        { name: 'min', selector: { number: { mode: 'box' } } },
        { name: 'max', selector: { number: { mode: 'box' } } },
      ],
    };
  }

  protected normalizeConfig(config: ValueCardConfig): ValueCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (config.layout && !LAYOUTS.includes(config.layout)) throw new Error(`layout must be one of: ${LAYOUTS.join(', ')}`);
    if (config.kind && !['auto', 'boolean', 'number'].includes(config.kind)) throw new Error('kind must be auto, boolean or number');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  override getGridOptions(): LovelaceGridOptions {
    switch (this.config.layout) {
      case 'mini':
        return { columns: 4, rows: 1, min_columns: 3, min_rows: 1, max_rows: 1 };
      case 'row':
        return { columns: 12, rows: 1, min_columns: 4, min_rows: 1 };
      default:
        return { columns: 6, rows: 2, min_columns: 4, min_rows: 2 };
    }
  }

  override getCardSize(): number {
    return this.config.layout === 'row' || this.config.layout === 'mini' ? 1 : 2;
  }

  protected override defaultAccent(): Accent {
    const s = this.stateObj(this.config.entity);
    const dc = this.config.attribute ? undefined : (s?.attributes.device_class as string | undefined);
    if (this.kind(s) === 'boolean') return BOOL_CLASS[dc ?? '']?.[2] ?? defaultAccentFor(this.config.entity);
    return DEVICE[dc ?? '']?.accent ?? 'blue';
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    // The default accent depends on the device class and the value, which need hass.
    if (changed.has('hass') && !this.config.color) {
      const accent = this.defaultAccent();
      if (this.dataset.accent !== accent) this.dataset.accent = accent;
    }
  }

  private raw(s: HassEntity | undefined): unknown {
    if (!s) return undefined;
    return this.config.attribute ? s.attributes[this.config.attribute] : s.state;
  }

  private kind(s: HassEntity | undefined): Kind {
    const k = this.config.kind ?? 'auto';
    if (k !== 'auto') return k;
    const v = this.raw(s);
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (!this.config.attribute && BOOL_DOMAINS.has(domainOf(this.config.entity))) return 'boolean';
    // Unavailable / unknown: keep the number styling for the "—".
    if (this.missing(s)) return 'number';
    const str = String(v ?? '').toLowerCase();
    if (BOOL_VALUES.has(str)) return 'boolean';
    return str !== '' && Number.isFinite(Number(str)) ? 'number' : 'text';
  }

  private missing(s: HassEntity | undefined): boolean {
    if (this.config.attribute) return !s || this.raw(s) === undefined || this.raw(s) === null;
    return isUnavailable(s);
  }

  private deviceClass(s: HassEntity | undefined): string {
    return this.config.attribute ? '' : ((s?.attributes.device_class as string) ?? '');
  }

  private isOn(s: HassEntity | undefined): boolean {
    const v = this.raw(s);
    return v === true || ON_VALUES.has(String(v ?? '').toLowerCase());
  }

  private boolText(s: HassEntity | undefined, on: boolean): string {
    const c = BOOL_CLASS[this.deviceClass(s)];
    return on ? (this.config.on_text ?? c?.[0] ?? 'オン') : (this.config.off_text ?? c?.[1] ?? 'オフ');
  }

  private number(s: HassEntity | undefined): number | undefined {
    const n = Number(this.raw(s));
    return this.missing(s) || String(this.raw(s)).trim() === '' || !Number.isFinite(n) ? undefined : n;
  }

  private decimals(): number | undefined {
    if (this.config.decimals !== undefined) return this.config.decimals;
    if (this.config.attribute) return undefined;
    const reg = (this.hass?.entities?.[this.config.entity] as { display_precision?: number } | undefined)?.display_precision;
    return typeof reg === 'number' ? reg : undefined;
  }

  private formatNumber(n: number | undefined): string {
    if (n === undefined) return '—';
    const d = this.decimals();
    return d === undefined
      ? n.toLocaleString('ja-JP', { maximumFractionDigits: 3 })
      : n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  private unit(s: HassEntity | undefined): string {
    if (this.config.unit !== undefined) return this.config.unit;
    return this.config.attribute ? '' : ((s?.attributes.unit_of_measurement as string) ?? '');
  }

  private icon(s: HassEntity | undefined, kind: Kind, on: boolean): string {
    if (this.config.icon) return this.config.icon;
    if (!this.config.attribute && s?.attributes.icon) return s.attributes.icon as string;
    const dc = this.deviceClass(s);
    if (kind === 'boolean') {
      if (dc === 'lock') return on ? 'lock-open-right' : 'lock';
      if (BOOL_CLASS[dc]) return BOOL_CLASS[dc][3];
      return defaultIconFor(s, this.config.entity);
    }
    return DEVICE[dc]?.icon ?? 'sensors';
  }

  protected override render() {
    const s = this.stateObj(this.config.entity);
    const kind = this.kind(s);
    const missing = this.missing(s);
    const on = kind === 'boolean' && !missing && this.isOn(s);
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const icon = this.icon(s, kind, on);

    let text: string;
    let unit = '';
    let level: SensorLevel | undefined;
    let fraction: number | undefined;
    if (missing) text = '—';
    else if (kind === 'boolean') text = this.boolText(s, on);
    else if (kind === 'number') {
      const n = this.number(s);
      text = this.formatNumber(n);
      unit = n === undefined ? '' : this.unit(s);
      level = levelFor(n, this.config.attribute ? this.config.levels : sensorLevels(s, this.config.levels));
      const { min, max } = this.config;
      if (n !== undefined && (min !== undefined || max !== undefined)) {
        const lo = min ?? 0;
        const hi = max ?? 100;
        fraction = hi > lo ? Math.min(1, Math.max(0, (n - lo) / (hi - lo))) : 0;
      }
    } else text = String(this.raw(s) ?? '—');

    const layout = this.config.layout ?? 'tile';
    const row = layout === 'row';
    const mini = layout === 'mini';
    const classes = [
      'card',
      'interactive',
      layout,
      kind,
      kind === 'boolean' ? (on ? 'on' : 'off') : '',
      this.gesture.pressed ? 'pressed' : '',
      missing ? 'unavailable' : '',
    ].join(' ');
    const label = `${name} ${text}${unit ? ` ${unit}` : ''}${level ? ` ${level.label}` : ''}`;
    // mini has no room for the chip: the level tints the icon instead.
    const chip = level && !mini ? html`<span class="chip">${level.label}</span>` : nothing;
    const value = html`<div class="value">
      <m3e-rolling-text .text=${text}></m3e-rolling-text>${unit ? html`<span class="unit">${unit}</span>` : nothing}
    </div>`;

    if (row) {
      return html`<div class=${classes} data-accent=${level ? (level.color ?? 'green') : nothing} role="button" tabindex="0" aria-label=${label} ${press(this.gesture)}>
        <m3e-icon .icon=${icon}></m3e-icon>
        <span class="name">${name}</span>
        ${chip}
        ${kind === 'boolean' ? html`<span class="pill ${on ? 'on' : ''}"><m3e-rolling-text .text=${text}></m3e-rolling-text></span>` : value}
      </div>`;
    }
    return html`<div class=${classes} data-accent=${level ? (level.color ?? 'green') : nothing} role="button" tabindex="0" aria-label=${label} ${press(this.gesture)}>
      <div class="top">
        <m3e-icon .icon=${icon}></m3e-icon>
        <span class="name">${name}</span>
        ${chip}
      </div>
      <div class="stack">
        ${value}
        ${fraction === undefined ? nothing : html`<div class="bar" aria-hidden="true"><span style="width:${fraction * 100}%"></span></div>`}
      </div>
    </div>`;
  }
}

define('m3e-value-card', M3eValueCard);
