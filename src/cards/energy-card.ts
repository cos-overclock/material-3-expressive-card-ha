import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { isUnavailable, numState } from '../ha/helpers';
import { addSeries, energySources, mergeSources, range, statChanges, sum, type EnergyDevice, type EnergySources } from '../ha/energy';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';

export interface EnergyCardConfig extends BaseCardConfig {
  title?: string;
  /** Current house consumption (W or kW). */
  power_entity?: string;
  solar_power_entity?: string;
  /** Battery state of charge (%). */
  battery_entity?: string;
  /** Grid power: positive while buying, negative while selling. */
  grid_power_entity?: string;
  /** Devices broken out in the chart (statistic ids). Default: the 3 largest from the energy settings. */
  devices?: (string | (EnergyDevice & { color?: Accent }))[];
  /** Override the energy settings' sources (statistic ids). */
  sources?: Partial<Record<'grid_in' | 'grid_out' | 'solar' | 'battery_in' | 'battery_out', string | string[]>>;
  /** Show the hourly chart. Default true. */
  show_chart?: boolean;
}

const DEVICE_COLORS: Accent[] = ['lavender', 'sky', 'teal', 'pink', 'mauve', 'peach'];
const REFRESH_MS = 5 * 60_000;

interface Hourly {
  devices: { name: string; color: Accent; values: number[] }[];
  other: number[];
  solar: number[];
  battery: number[];
  consumption: number[];
  /** Today vs yesterday up to the same hour, as a ratio − 1. */
  change?: number;
  hasSolar: boolean;
  hasBattery: boolean;
}

/** Consumption per bucket: what came in minus what went out. */
function consumptionSeries(data: Record<string, number[]>, s: EnergySources, n: number): number[] {
  const inflow = addSeries(data, [...s.grid_in, ...s.solar, ...s.battery_out], n);
  const outflow = addSeries(data, [...s.grid_out, ...s.battery_in], n);
  const hasSources = s.grid_in.length + s.solar.length + s.battery_out.length > 0;
  if (!hasSources) return addSeries(data, s.devices.map((d) => d.stat), n);
  return inflow.map((v, i) => Math.max(0, v - outflow[i]));
}

function kw(s: HassEntity | undefined): number | undefined {
  const v = numState(s);
  if (v === undefined) return undefined;
  const unit = String(s?.attributes.unit_of_measurement ?? 'kW');
  return unit === 'W' ? v / 1000 : unit === 'MW' ? v * 1000 : v;
}

/** A tick that gives one or two grid lines each way: 0.25, 0.5, 1, 2, 5 kWh… */
function niceTick(max: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  return steps.find((s) => max / s <= 1.6) ?? 100;
}

/**
 * Energy overview: current consumption, solar / battery / grid tiles and a
 * diverging hourly chart of today — consumption stacked upward by device,
 * supply (solar, battery discharge) downward.
 *
 * Motion: the power value rolls; the bolt cookie turns slowly while solar is
 * producing; bars grow out of the zero line on the default spatial spring,
 * staggered by hour; tapping an hour lifts it and reads it out.
 */
export class M3eEnergyCard extends M3eBaseCard<EnergyCardConfig> {
  static override accentHint = '消費電力のアイコンの色を変えます。太陽光・蓄電池・買電のタイルとグラフの色は変わりません。';

  @state() private hourly?: Hourly;
  @state() private selected: number | null = null;
  private loadedAt = 0;
  private loading = false;
  /** idle → growing (zero height) → grown (staggered transition) → settled. */
  @state() private growth: 'idle' | 'growing' | 'grown' | 'settled' = 'idle';

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .now {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .label {
        font: 400 14px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .power {
        display: flex;
        align-items: baseline;
        gap: 6px;
        cursor: pointer;
      }
      .power .v {
        font: 600 52px / 60px var(--m3e-font-brand);
        letter-spacing: -1.5px;
        font-variant-numeric: tabular-nums;
      }
      .power .u {
        font: 400 22px / 28px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
      }
      .now m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
        --m3e-icon-size: 30px;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 8px;
      }
      .tile {
        padding: 10px 14px 12px;
        border-radius: 16px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        cursor: pointer;
        transition:
          background-color var(--m3e-effects-default),
          border-radius var(--m3e-spatial-fast);
      }
      .tile:active {
        border-radius: 24px;
      }
      .tile .k {
        display: flex;
        align-items: center;
        gap: 4px;
        font: 500 13px / 18px var(--m3e-font-plain);
      }
      .tile .k m3e-icon {
        --m3e-icon-size: 16px;
      }
      .tile .v {
        font: 600 18px / 26px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .chart-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .chart-title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      .delta {
        font: 500 13px / 18px var(--m3e-font-brand);
        color: var(--acc-green);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .delta.up {
        color: var(--acc-peach);
      }
      .delta.readout {
        color: var(--m3-on-surface);
      }
      .legend {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        margin-top: -6px;
      }
      .legend b {
        font-weight: 500;
        color: var(--m3-on-surface);
      }
      .legend .items {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 12px;
      }
      .legend i {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        margin-right: 5px;
        background: var(--c);
      }
      .chart {
        position: relative;
        height: 180px;
      }
      .gridline {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--m3-outline-variant);
      }
      .gridline.zero {
        background: var(--m3-outline);
      }
      .gridline span {
        position: absolute;
        right: 0;
        bottom: 3px;
        font: 400 11px / 14px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        background: var(--m3-surface-container);
        padding-left: 4px;
      }
      .cols {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(24, minmax(0, 1fr));
      }
      .col {
        position: relative;
        cursor: pointer;
      }
      .col.current::before,
      .col.selected::before {
        content: '';
        position: absolute;
        left: 6%;
        right: 6%;
        top: 0;
        bottom: 0;
        border-radius: 6px;
        background: var(--m3-surface-highest);
        opacity: 0.6;
      }
      .col.selected::before {
        opacity: 1;
      }
      .stack {
        position: absolute;
        left: 18%;
        right: 18%;
        display: flex;
        gap: 1px;
        transition: transform var(--m3e-spatial-fast);
      }
      .stack.up {
        flex-direction: column-reverse;
        transform-origin: bottom;
      }
      .stack.down {
        flex-direction: column;
        transform-origin: top;
      }
      .col.selected .stack.up {
        transform: translateY(-3px);
      }
      .col.selected .stack.down {
        transform: translateY(3px);
      }
      .seg {
        flex: none;
        border-radius: 2px;
        background: var(--c);
        transition: height var(--m3e-spatial-default);
      }
      .future {
        position: absolute;
        left: 18%;
        right: 18%;
        height: 5px;
        margin-top: -2.5px;
        border-radius: 3px;
        background: var(--m3-surface-highest);
      }
      .axis {
        display: flex;
        justify-content: space-between;
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        margin-top: -6px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .label {
        font: 400 13px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .power .v {
        font: 600 40px / 46px var(--m3e-font-brand);
      }
      :host([compact]) .power .u {
        font: 400 18px / 24px var(--m3e-font-brand);
      }
      :host([compact]) .now m3e-shape {
        --m3e-icon-size: 24px;
      }
      :host([compact]) .tile {
        padding: 8px 10px 10px;
        border-radius: 14px;
      }
      :host([compact]) .tile .k {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .tile .v {
        font: 600 16px / 22px var(--m3e-font-brand);
      }
      :host([compact]) .chart-title {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .legend {
        font: 400 12px / 16px var(--m3e-font-plain);
        gap: 2px 10px;
        margin-top: -4px;
      }
      :host([compact]) .chart {
        height: 132px;
      }
      :host([compact]) .axis {
        font: 400 11px / 14px var(--m3e-font-plain);
        margin-top: -4px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, { attributes: Record<string, unknown> }> }) {
    const power = Object.keys(hass.states).find((id) => hass.states[id].attributes.device_class === 'power');
    return { type: 'custom:m3e-energy-card', power_entity: power };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'power_entity', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
        { name: 'solar_power_entity', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
        { name: 'battery_entity', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        { name: 'grid_power_entity', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
        { name: 'show_chart', default: true, selector: { boolean: {} } },
      ],
    };
  }

  protected normalizeConfig(config: EnergyCardConfig): EnergyCardConfig {
    return config;
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    return [c.power_entity, c.solar_power_entity, c.battery_entity, c.grid_power_entity].filter(Boolean) as string[];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.config.show_chart === false ? 3 : 7;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (this.config.show_chart !== false && this.hass && Date.now() - this.loadedAt > REFRESH_MS) this.load();
  }

  private async load(): Promise<void> {
    if (this.loading || !this.hass) return;
    this.loading = true;
    this.loadedAt = Date.now();
    try {
      const src = mergeSources(await energySources(this.hass), { ...this.config.sources });
      const { start, end, period, buckets } = range('day');
      const ySrc = { ...src, devices: [] };
      const yStart = new Date(start.getTime() - 86400_000);
      const flowIds = [...src.grid_in, ...src.grid_out, ...src.solar, ...src.battery_in, ...src.battery_out];
      const [today, yesterday] = await Promise.all([
        statChanges(this.hass, [...new Set([...flowIds, ...src.devices.map((d) => d.stat)])], start, end, period, buckets),
        statChanges(this.hass, flowIds, yStart, start, period, buckets),
      ]);
      const consumption = consumptionSeries(today, src, buckets);
      // Devices to break out: configured, else the three largest today.
      const configured = this.config.devices?.map((d) => (typeof d === 'string' ? { stat: d } : d));
      const picked = (configured ?? [...src.devices].sort((a, b) => sum(today[b.stat] ?? []) - sum(today[a.stat] ?? [])).slice(0, 3)) as (EnergyDevice & {
        color?: Accent;
      })[];
      if (configured) {
        const extra = await statChanges(this.hass, configured.map((d) => d.stat).filter((id) => !today[id]), start, end, period, buckets);
        Object.assign(today, extra);
      }
      const devices = picked.map((d, i) => ({
        name: d.name ?? (this.hass!.states[d.stat]?.attributes.friendly_name as string) ?? d.stat,
        color: d.color ?? DEVICE_COLORS[i % DEVICE_COLORS.length],
        values: today[d.stat] ?? Array(buckets).fill(0),
      }));
      const other = consumption.map((v, i) => Math.max(0, v - devices.reduce((a, d) => a + d.values[i], 0)));
      const hour = new Date().getHours();
      const todaySoFar = sum(consumption.slice(0, hour + 1));
      const ySoFar = sum(consumptionSeries(yesterday, ySrc, buckets).slice(0, hour + 1));
      this.hourly = {
        devices,
        other,
        solar: addSeries(today, src.solar, buckets),
        battery: addSeries(today, src.battery_out, buckets),
        consumption,
        change: ySoFar > 0 ? todaySoFar / ySoFar - 1 : undefined,
        hasSolar: src.solar.length > 0,
        hasBattery: src.battery_out.length > 0,
      };
    } catch (e) {
      console.warn('m3e-energy-card: statistics unavailable', e);
    } finally {
      this.loading = false;
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    // First data: render at zero height, then let the bars grow on the next frame.
    if (this.hourly && this.growth === 'idle') {
      this.growth = 'growing';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          this.growth = 'grown';
          setTimeout(() => (this.growth = 'settled'), 1200);
        }),
      );
    }
  }

  protected override defaultAccent(): Accent {
    return 'green';
  }

  private renderTiles() {
    const c = this.config;
    const tiles = [];
    const solar = kw(this.stateObj(c.solar_power_entity));
    if (c.solar_power_entity)
      tiles.push(html`<div class="tile" data-accent="yellow" @click=${() => this.moreInfo(c.solar_power_entity)}>
        <p class="k"><m3e-icon icon="solar-power"></m3e-icon>太陽光</p>
        <p class="v">${solar === undefined ? '—' : `${solar.toFixed(2)} kW`}</p>
      </div>`);
    const bat = numState(this.stateObj(c.battery_entity));
    if (c.battery_entity)
      tiles.push(html`<div class="tile" data-accent="green" @click=${() => this.moreInfo(c.battery_entity)}>
        <p class="k"><m3e-icon icon="battery-full"></m3e-icon>蓄電池</p>
        <p class="v">${bat === undefined ? '—' : `${Math.round(bat)}%`}</p>
      </div>`);
    const grid = kw(this.stateObj(c.grid_power_entity));
    if (c.grid_power_entity) {
      const selling = grid !== undefined && grid < 0;
      tiles.push(html`<div class="tile" data-accent=${selling ? 'blue' : 'peach'} @click=${() => this.moreInfo(c.grid_power_entity)}>
        <p class="k"><m3e-icon icon="bolt"></m3e-icon>${selling ? '売電' : '買電'}</p>
        <p class="v">${grid === undefined ? '—' : `${Math.abs(grid).toFixed(2)} kW`}</p>
      </div>`);
    }
    return tiles.length ? html`<div class="tiles">${tiles}</div>` : nothing;
  }

  private renderChart(h: Hourly) {
    const n = h.consumption.length;
    const hour = new Date().getHours();
    const up = h.consumption.map((_, i) => h.devices.reduce((a, d) => a + d.values[i], 0) + h.other[i]);
    const down = h.solar.map((v, i) => v + h.battery[i]);
    const maxUp = Math.max(0.1, ...up);
    const maxDown = Math.max(0, ...down);
    const tick = niceTick(Math.max(maxUp, maxDown));
    const top = Math.max(maxUp, tick) * 1.04;
    const bottom = maxDown > 0 ? Math.max(maxDown, tick) * 1.04 : 0;
    const H = 180;
    const pxPer = H / (top + bottom);
    const zero = top * pxPer;
    const px = (v: number) => (this.growth === 'growing' ? 0 : Math.max(0, v * pxPer - 1));
    const delay = (i: number) => (this.growth === 'grown' ? `transition-delay:${i * 18}ms` : '');
    const lines = [
      { v: tick, y: zero - tick * pxPer, label: `+${tick} kWh` },
      ...(bottom >= tick ? [{ v: -tick, y: zero + tick * pxPer, label: `−${tick} kWh` }] : []),
    ];
    return html`<div class="chart" role="img" aria-label="今日の時間ごとの消費と供給">
        ${lines.map((l) => html`<div class="gridline ${l.v < 0 ? 'neg' : ''}" style="top:${l.y}px"><span>${l.label}</span></div>`)}
        <div class="gridline zero" style="top:${zero}px"></div>
        <div class="cols">
          ${Array.from({ length: n }, (_, i) => {
            const future = i > hour;
            return html`<div
              class="col ${i === hour ? 'current' : ''} ${this.selected === i ? 'selected' : ''}"
              @click=${() => (this.selected = this.selected === i || future ? null : i)}
            >
              ${future
                ? html`<div class="future" style="top:${zero}px"></div>`
                : html`<div class="stack up" style="bottom:${H - zero + 1}px">
                      ${h.devices.map(
                        (d) => html`<div class="seg" style="--c:var(--acc-${d.color});height:${px(d.values[i])}px;${delay(i)}"></div>`,
                      )}
                      <div class="seg" style="--c:var(--m3-outline);height:${px(h.other[i])}px;${delay(i)}"></div>
                    </div>
                    <div class="stack down" style="top:${zero + 1}px">
                      <div class="seg" style="--c:var(--acc-yellow);height:${px(h.solar[i])}px;${delay(i)}"></div>
                      <div class="seg" style="--c:var(--acc-green);height:${px(h.battery[i])}px;${delay(i)}"></div>
                    </div>`}
            </div>`;
          })}
        </div>
      </div>
      <div class="axis" aria-hidden="true"><span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>24時</span></div>`;
  }

  private headline(h: Hourly) {
    if (this.selected !== null) {
      const i = this.selected;
      const parts = [`消費 ${h.consumption[i].toFixed(2)}`];
      if (h.hasSolar) parts.push(`太陽光 ${h.solar[i].toFixed(2)}`);
      if (h.hasBattery && h.battery[i] > 0) parts.push(`放電 ${h.battery[i].toFixed(2)}`);
      return html`<span class="delta readout">${i}時 ${parts.join('・')} kWh</span>`;
    }
    if (h.change === undefined) return nothing;
    const pct = Math.round(h.change * 100);
    return html`<span class="delta ${pct > 0 ? 'up' : ''}">昨日より ${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%</span>`;
  }

  protected override render() {
    const c = this.config;
    const ps = this.stateObj(c.power_entity);
    const p = kw(ps);
    const solarOn = (kw(this.stateObj(c.solar_power_entity)) ?? 0) > 0.05;
    const h = this.hourly;
    return html`<div class="card">
      ${c.power_entity
        ? html`<div class="now">
            <div @click=${() => this.moreInfo(c.power_entity)} class="${isUnavailable(ps) ? 'unavailable' : ''}">
              <p class="label">${c.title ?? '現在の消費電力'}</p>
              <p class="power">
                <span class="v"><m3e-rolling-text .text=${p === undefined ? '—' : p.toFixed(2)}></m3e-rolling-text></span><span class="u">kW</span>
              </p>
            </div>
            <m3e-shape shape="cookie12" size=${this.compact ? 48 : 64} ?spin=${solarOn}><m3e-icon icon="bolt"></m3e-icon></m3e-shape>
          </div>`
        : nothing}
      ${this.renderTiles()}
      ${c.show_chart === false || !h
        ? nothing
        : html`<div class="chart-head">
              <span class="chart-title">時間ごとの消費と供給</span>
              ${this.headline(h)}
            </div>
            <div class="legend">
              <b>消費</b>
              <span class="items">
                ${h.devices.map((d) => html`<span><i style="--c:var(--acc-${d.color})"></i>${d.name}</span>`)}
                <span><i style="--c:var(--m3-outline)"></i>その他</span>
              </span>
              ${h.hasSolar || h.hasBattery
                ? html`<b>供給</b>
                    <span class="items">
                      ${h.hasSolar ? html`<span><i style="--c:var(--acc-yellow)"></i>太陽光</span>` : nothing}
                      ${h.hasBattery ? html`<span><i style="--c:var(--acc-green)"></i>蓄電池（放電）</span>` : nothing}
                    </span>`
                : nothing}
            </div>
            ${this.renderChart(h)}`}
    </div>`;
  }
}

define('m3e-energy-card', M3eEnergyCard);
