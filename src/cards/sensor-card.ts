import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, actionsSection, TAP_ACTION_FIELD, type BaseCardConfig } from './base-card';
import { levelsField } from '../editor/form-helpers';
import { fetchHistory, resample, type Point } from '../ha/history';
import { hhmm, isUnavailable, numState } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-line-chart';
import '../components/m3e-rolling-text';

export interface SensorLevel {
  /** Upper bound (exclusive). Omit on the last level. */
  max?: number;
  label: string;
  color?: Accent;
}

export interface SensorCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** full: large graph with min / max / mean. compact: value and a sparkline. */
  layout?: 'full' | 'compact';
  /** History window in hours. Default 24. */
  hours?: number;
  /** Decimals shown. Default from the entity, else 1 for temperature, 0 otherwise. */
  decimals?: number;
  /** Status chip from the value, e.g. CO₂ 良好 / やや高い / 換気を. */
  levels?: SensorLevel[];
  /** Show the min / max / mean tiles (full layout). Default true. */
  show_stats?: boolean;
}

const SAMPLES = 48;
const REFRESH_MS = 10 * 60_000;

export const DEVICE: Record<string, { icon: string; accent: Accent; span: number }> = {
  temperature: { icon: 'thermometer', accent: 'peach', span: 2 },
  humidity: { icon: 'humidity-percentage', accent: 'sky', span: 10 },
  carbon_dioxide: { icon: 'co2', accent: 'green', span: 200 },
  pm25: { icon: 'air', accent: 'teal', span: 10 },
  pm10: { icon: 'air', accent: 'teal', span: 10 },
  volatile_organic_compounds: { icon: 'air', accent: 'teal', span: 50 },
  illuminance: { icon: 'sunny', accent: 'yellow', span: 50 },
  power: { icon: 'electric-bolt', accent: 'yellow', span: 100 },
  energy: { icon: 'electric-bolt', accent: 'yellow', span: 1 },
  battery: { icon: 'battery-full', accent: 'green', span: 10 },
  pressure: { icon: 'cloud', accent: 'lavender', span: 4 },
};

/** Built-in levels for CO₂ (ppm), used when the config has none. */
const CO2_LEVELS: SensorLevel[] = [
  { max: 1000, label: '良好', color: 'green' },
  { max: 1500, label: 'やや高い', color: 'yellow' },
  { label: '換気を', color: 'red' },
];

export function levelFor(value: number | undefined, levels: SensorLevel[] | undefined): SensorLevel | undefined {
  if (value === undefined || !levels?.length) return undefined;
  return levels.find((l) => l.max === undefined || value < l.max) ?? levels[levels.length - 1];
}

export function sensorLevels(s: HassEntity | undefined, configured?: SensorLevel[]): SensorLevel[] | undefined {
  if (configured) return configured;
  return s?.attributes.device_class === 'carbon_dioxide' ? CO2_LEVELS : undefined;
}

/**
 * A sensor with its recent history.
 *
 *  full     shape + name, the current value, a 24h area chart with grid lines
 *           and hour labels, and min / max / mean tiles. Touch or hover the
 *           chart to read any point: the header value follows the finger.
 *  compact  icon, name, optional status chip, the value and a sparkline.
 *
 * Motion: the line wipes in when history arrives and later updates morph it;
 * the value rolls up or down; the chip re-tints when the level changes.
 */
export class M3eSensorCard extends M3eBaseCard<SensorCardConfig> {
  @state() private history: Point[] = [];
  @state() private scrubIndex: number | null = null;
  private fetchedFor?: string;
  /** Entity and hours the history on screen belongs to. */
  private historyFor?: string;
  /** Bumped by every fetch, so a late answer to an earlier one is dropped. */
  private fetchSeq = 0;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private fetchedAt = 0;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        cursor: default;
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
      .text {
        flex: 1;
        min-width: 0;
        cursor: pointer;
      }
      .name {
        font: 500 16px / 24px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sub {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .value {
        display: flex;
        align-items: baseline;
        gap: 4px;
        font: 600 36px / 44px var(--m3e-font-brand);
        letter-spacing: -0.5px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .unit {
        font: 400 18px / 24px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        letter-spacing: 0;
      }
      .chart {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .chart m3e-line-chart {
        height: 108px;
      }
      .axis {
        position: relative;
        height: 18px;
        font: 400 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .axis span {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      .axis span:first-child {
        transform: none;
      }
      .axis .now {
        right: 0;
        transform: none;
        color: var(--accent-fill);
        font-weight: 500;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .stat {
        padding: 8px 12px;
        border-radius: 16px;
        background: var(--m3-surface-high);
      }
      .stat .k {
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .stat .v {
        font: 600 16px / 24px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .stat.hi .v {
        color: var(--accent-fill);
      }
      .stat.lo .v {
        color: var(--acc-sky);
      }

      /* compact */
      .card.compact {
        padding: 16px;
        gap: 6px;
        height: 100%;
        min-height: 120px;
        justify-content: space-between;
        cursor: pointer;
      }
      .compact .top {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
      }
      .compact .top m3e-icon {
        --m3e-icon-size: 18px;
        color: var(--accent-fill);
      }
      .compact .label {
        flex: 1;
        min-width: 0;
        font: 400 14px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
      .compact .value {
        font-size: 30px;
        line-height: 36px;
      }
      .compact .unit {
        font-size: 15px;
      }
      .compact m3e-line-chart {
        height: 28px;
        margin: 0 -2px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card:not(.compact) {
        padding: 14px;
        gap: 12px;
      }
      :host([compact]) .header {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .card:not(.compact) .value {
        font: 600 28px / 36px var(--m3e-font-brand);
      }
      :host([compact]) .card:not(.compact) .unit {
        font: 400 15px / 20px var(--m3e-font-brand);
      }
      :host([compact]) .chart {
        gap: 6px;
      }
      :host([compact]) .chart m3e-line-chart {
        height: 76px;
      }
      :host([compact]) .stat {
        padding: 6px 10px;
        border-radius: 12px;
      }
      :host([compact]) .stat .v {
        font: 600 15px / 20px var(--m3e-font-brand);
      }
      :host([compact]) .card.compact {
        padding: 12px 14px;
        gap: 4px;
      }
      :host([compact]) .compact .value {
        font-size: 26px;
        line-height: 34px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, { attributes: Record<string, unknown> }> }) {
    const entity =
      Object.keys(hass.states).find((id) => id.startsWith('sensor.') && hass.states[id].attributes.device_class === 'temperature') ??
      'sensor.example';
    return { type: 'custom:m3e-sensor-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'sensor' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'layout', selector: { select: { options: ['full', 'compact'] } } },
        { name: 'hours', selector: { number: { min: 1, max: 168, mode: 'box' } } },
        levelsField(),
        actionsSection(TAP_ACTION_FIELD),
      ],
    };
  }

  protected normalizeConfig(config: SensorCardConfig): SensorCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  protected override defaultAccent(): Accent {
    const dc = this.hass?.states[this.config.entity]?.attributes.device_class as string | undefined;
    return DEVICE[dc ?? '']?.accent ?? 'blue';
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.config.layout === 'compact'
      ? { columns: 6, rows: 2, min_columns: 4, min_rows: 2 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.config.layout === 'compact' ? 2 : 5;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.startRefresh();
  }

  protected override visibilityChanged(visible: boolean): void {
    // Back on the page after a while: the graph is stale, fetch it now.
    if (visible && Date.now() - this.fetchedAt > REFRESH_MS) this.loadHistory(true);
    this.startRefresh();
  }

  /** Refetch the history every REFRESH_MS while the page is visible. */
  private startRefresh(): void {
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    if (this.pageVisible) this.refreshTimer = setInterval(() => this.loadHistory(true), REFRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.refreshTimer);
    this.fetchedFor = undefined;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    // The accent comes from the device class, which needs hass.
    if (changed.has('hass') && !this.config.color) {
      const accent = this.defaultAccent();
      if (this.dataset.accent !== accent) this.dataset.accent = accent;
    }
    if (changed.has('hass') || changed.has('config' as keyof M3eSensorCard)) this.loadHistory(false);
  }

  private async loadHistory(force: boolean): Promise<void> {
    if (!this.hass || !this.config) return;
    const key = `${this.config.entity}|${this.config.hours ?? 24}`;
    if (!force && this.fetchedFor === key) return;
    // Another entity or window: the old history doesn't belong on this chart.
    if (this.historyFor !== key) {
      this.history = [];
      this.historyFor = key;
    }
    this.fetchedFor = key;
    this.fetchedAt = Date.now();
    const seq = ++this.fetchSeq;
    const entity = this.config.entity;
    try {
      const res = await fetchHistory(this.hass, [entity], this.config.hours ?? 24);
      if (seq !== this.fetchSeq) return;
      this.history = res[entity] ?? [];
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      console.warn('m3e-sensor-card: history unavailable', e);
    }
  }

  /** Bucketed values for the chart, ending with the live state. */
  private series(s: HassEntity | undefined): { values: (number | null)[]; start: number; end: number } {
    const end = Date.now();
    const start = end - (this.config.hours ?? 24) * 3600_000;
    const live = numState(s);
    const pts = live !== undefined ? [...this.history, [end - 1, live] as Point] : this.history;
    const values = resample(pts, start, end, SAMPLES);
    if (live !== undefined) values[values.length - 1] = live;
    return { values, start, end };
  }

  private decimals(s: HassEntity | undefined): number {
    if (this.config.decimals !== undefined) return this.config.decimals;
    const reg = (this.hass?.entities?.[this.config.entity] as { display_precision?: number } | undefined)?.display_precision;
    if (typeof reg === 'number') return reg;
    return s?.attributes.device_class === 'temperature' ? 1 : 0;
  }

  private fmt(v: number | undefined | null, s: HassEntity | undefined): string {
    return v === undefined || v === null ? '—' : v.toFixed(this.decimals(s));
  }

  private unit(s: HassEntity | undefined): string {
    return (s?.attributes.unit_of_measurement as string) ?? '';
  }

  /** Short unit for the stat tiles: "°" for temperatures. */
  private shortUnit(s: HassEntity | undefined): string {
    const u = this.unit(s);
    return u === '°C' || u === '°F' ? '°' : u === '%' ? '%' : '';
  }

  private icon(s: HassEntity | undefined): string {
    return this.config.icon ?? (s?.attributes.icon as string) ?? DEVICE[s?.attributes.device_class ?? '']?.icon ?? 'sensors';
  }

  private axis(start: number, end: number) {
    const hours = (end - start) / 3600_000;
    const stepH = Math.max(1, Math.round(hours / 4));
    const first = new Date(start);
    first.setMinutes(0, 0, 0);
    let t = first.getTime() + 3600_000;
    const labels: { pos: number; text: string }[] = [];
    for (; t < end; t += stepH * 3600_000) {
      const pos = (t - start) / (end - start);
      if (pos > 0.86) break;
      const d = new Date(t);
      labels.push({ pos, text: hours > 48 ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getHours()}時` });
    }
    return html`<div class="axis" aria-hidden="true">
      ${labels.map((l, i) => html`<span style="left:${i === 0 && l.pos < 0.06 ? 0 : l.pos * 100}%">${l.text}</span>`)}
      <span class="now">いま</span>
    </div>`;
  }

  private renderFull(s: HassEntity | undefined) {
    const { values, start, end } = this.series(s);
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const nums = values.filter((v): v is number => v !== null);
    const scrubbing = this.scrubIndex !== null && values[this.scrubIndex] != null;
    const shown = scrubbing ? values[this.scrubIndex!] : numState(s);
    const at = scrubbing ? start + ((this.scrubIndex! + 0.5) / SAMPLES) * (end - start) : 0;
    const hours = this.config.hours ?? 24;
    const dc = s?.attributes.device_class as string | undefined;
    const short = this.shortUnit(s);
    return html`<div class="card ${isUnavailable(s) ? 'unavailable' : ''}">
      <div class="header">
        <m3e-shape shape="cookie9" size=${this.compact ? 36 : 44} @click=${() => this.tapEntity(this.config.entity)}>
          <m3e-icon .icon=${this.icon(s)}></m3e-icon>
        </m3e-shape>
        <div class="text" @click=${() => this.tapEntity(this.config.entity)}>
          <p class="name">${name}</p>
          <p class="sub">${scrubbing ? `${hhmm(at)} ごろ` : `過去${hours}時間`}</p>
        </div>
        <div class="value">
          <m3e-rolling-text .text=${this.fmt(shown, s)}></m3e-rolling-text><span class="unit">${this.unit(s)}</span>
        </div>
      </div>
      <div class="chart">
        <m3e-line-chart
          .values=${values}
          .minSpan=${DEVICE[dc ?? '']?.span ?? 1}
          area
          dot
          scrub
          grid="3"
          @scrub=${(e: CustomEvent) => (this.scrubIndex = e.detail.index)}
        ></m3e-line-chart>
        ${this.axis(start, end)}
      </div>
      ${this.config.show_stats === false || !nums.length
        ? nothing
        : html`<div class="stats">
            <div class="stat hi"><p class="k">最高</p><p class="v">${this.fmt(Math.max(...nums), s)}${short}</p></div>
            <div class="stat lo"><p class="k">最低</p><p class="v">${this.fmt(Math.min(...nums), s)}${short}</p></div>
            <div class="stat"><p class="k">平均</p><p class="v">${this.fmt(nums.reduce((a, b) => a + b, 0) / nums.length, s)}${short}</p></div>
          </div>`}
    </div>`;
  }

  private renderCompact(s: HassEntity | undefined) {
    const { values } = this.series(s);
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const v = numState(s);
    const level = levelFor(v, sensorLevels(s, this.config.levels));
    const dc = s?.attributes.device_class as string | undefined;
    return html`<div class="card compact ${isUnavailable(s) ? 'unavailable' : ''}" @click=${() => this.tapEntity(this.config.entity)}>
      <div class="top">
        <m3e-icon .icon=${this.icon(s)}></m3e-icon>
        <span class="label">${name}</span>
        ${level ? html`<span class="chip" data-accent=${level.color ?? 'green'}>${level.label}</span>` : nothing}
      </div>
      <div class="value">
        <m3e-rolling-text .text=${this.fmt(v, s)}></m3e-rolling-text><span class="unit">${this.unit(s)}</span>
      </div>
      <m3e-line-chart .values=${values} .minSpan=${(DEVICE[dc ?? '']?.span ?? 1) / 3} strokeWidth="2.5"></m3e-line-chart>
    </div>`;
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    return this.config.layout === 'compact' ? this.renderCompact(s) : this.renderFull(s);
  }
}

define('m3e-sensor-card', M3eSensorCard);
