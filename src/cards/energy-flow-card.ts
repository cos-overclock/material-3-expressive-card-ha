import { css, html, nothing, svg, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { checkOneOf, type Issue } from '../editor/validate';
import { numState } from '../ha/helpers';
import { addSeries, flows, kwh, loadSources, range, statChanges, sum, type Flows } from '../ha/energy';
import { FetchTracker } from '../ha/fetch-state';
import type { LovelaceGridOptions } from '../ha/types';
import { prefersReducedMotion } from '../motion/spring';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';
import '../components/m3e-fetch-status';

export interface EnergyFlowCardConfig extends BaseCardConfig {
  title?: string;
  /** Totals for today (default), this week or this month. */
  period?: 'day' | 'week' | 'month';
  /** Battery state of charge (%) shown in the battery node. */
  battery_entity?: string;
  sources?: Partial<Record<'grid_in' | 'grid_out' | 'solar' | 'battery_in' | 'battery_out', string | string[]>>;
}

const PERIOD_LABEL = { day: '今日の合計', week: '今週の合計', month: '今月の合計' };
const REFRESH_MS = 5 * 60_000;

// Layout in a 336 × 300 box (the design's flow area).
const VB_W = 336;
const VB_H = 300;
const NODE = {
  solar: [168, 55],
  grid: [40, 146],
  home: [296, 146],
  battery: [168, 237],
} as const;
const PATH = {
  gridToHome: 'M80,146 H257',
  solarToBattery: 'M168,97 V195',
  solarToHome: 'M187,90 C192,128 214,138 257,138',
  solarToGrid: 'M146,90 C140,125 112,137 77,137',
  batteryToHome: 'M189,200 C193,166 220,155 257,154',
};

/**
 * Where today's energy went: solar, grid and battery feeding the house, with
 * the self-sufficiency rate. Line weight is constant (as in the design); the
 * moving dots carry the flow, faster for larger amounts. Export to the grid
 * is a dashed line whose dashes travel outward.
 *
 * Motion: dots travel along each flow (speed ∝ kWh); the house ring's
 * segments sweep to their shares on the default spatial spring; totals roll;
 * the solar cookie turns slowly while the sun is producing.
 */
export class M3eEnergyFlowCard extends M3eBaseCard<EnergyFlowCardConfig> {
  static override accentHint = '自給率の表示の色を変えます。太陽光・電力会社・蓄電池の色は変わりません。';

  @state() private f?: Flows;
  @state() private present = { solar: false, grid: false, battery: false };
  /** Shrinks the nodes and labels with the lines when the card is narrower than the design (336px). */
  @state() private k = 1;
  private ro?: ResizeObserver;
  private loadedAt = 0;
  private readonly fetch = new FetchTracker<{ f: Flows; present: { solar: boolean; grid: boolean; battery: boolean } }>(this, {
    label: 'm3e-energy-flow-card',
    isEmpty: ({ f }) => f.home === 0 && f.solar === 0 && f.gridOut === 0,
  });

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      .sub {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .self {
        padding: 6px 14px 8px;
        border-radius: 16px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        text-align: center;
      }
      .self .k {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      .self .v {
        font: 600 24px / 28px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .flow {
        position: relative;
        width: 100%;
        aspect-ratio: ${VB_W} / ${VB_H};
        container-type: inline-size;
      }
      svg.lines {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .line {
        fill: none;
        stroke-width: 3;
        stroke-linecap: round;
      }
      .line.export {
        stroke-dasharray: 6 6;
        animation: dash 1.2s linear infinite;
      }
      @keyframes dash {
        to {
          stroke-dashoffset: 12;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .line.export {
          animation: none;
        }
      }
      .c-solar {
        stroke: var(--acc-yellow);
        fill: var(--acc-yellow);
      }
      .c-grid {
        stroke: var(--acc-blue);
        fill: var(--acc-blue);
      }
      .c-battery {
        stroke: var(--acc-green);
        fill: var(--acc-green);
      }
      .ring-track {
        fill: var(--m3-surface-highest);
      }
      .ring {
        fill: none;
        stroke-width: 6;
        transition:
          stroke-dasharray var(--m3e-spatial-default),
          stroke-dashoffset var(--m3e-spatial-default);
      }
      .node,
      .label {
        transform-origin: 0 0;
        scale: var(--k, 1);
      }
      .node {
        position: absolute;
        transform: translate(-50%, -50%);
        display: grid;
        place-items: center;
        cursor: default;
      }
      .node > m3e-shape {
        grid-area: 1 / 1;
      }
      .node .content {
        grid-area: 1 / 1;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        font: 600 14px / 18px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* The unit sits under the figure, so "10.3 kWh" stays inside the 76px nodes. */
      .node .content > span {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 16px;
      }
      .node .content small {
        font: 500 11px / 12px var(--m3e-font-brand);
      }
      .node m3e-icon {
        --m3e-icon-size: 22px;
      }
      .solar m3e-shape {
        --m3e-shape-color: var(--acc-yellow-container);
      }
      .solar .content {
        color: var(--acc-on-yellow-container);
      }
      .grid .diamond {
        grid-area: 1 / 1;
        width: 56px;
        height: 56px;
        border-radius: 15px;
        transform: rotate(45deg);
        background: var(--acc-blue-container);
      }
      .grid .content {
        color: var(--acc-on-blue-container);
      }
      .home .content {
        color: var(--m3-on-surface);
      }
      .battery m3e-shape {
        --m3e-shape-color: var(--acc-green-container);
      }
      .battery .content {
        color: var(--acc-on-green-container);
        padding-top: 6px;
      }
      .label {
        position: absolute;
        font: 500 14px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface);
        white-space: nowrap;
      }
      .label small {
        display: block;
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .label.center {
        transform: translateX(-50%);
        text-align: center;
      }
      .label.above {
        transform: translate(-50%, -100%);
        text-align: center;
      }
      .label.right {
        transform: translateX(-100%);
        text-align: right;
      }
      .caption {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .caption b {
        font-weight: 500;
        color: var(--m3-on-surface);
        margin-right: 12px;
      }
      .empty {
        padding: 32px 0;
        text-align: center;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
      }
      :host([compact]) .title {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .self {
        padding: 4px 12px 6px;
        border-radius: 14px;
      }
      :host([compact]) .self .v {
        font: 600 20px / 24px var(--m3e-font-brand);
      }
      :host([compact]) .caption {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-energy-flow-card' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'period', selector: { select: { options: ['day', 'week', 'month'] } } },
        { name: 'battery_entity', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
      ],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    return checkOneOf(c, 'period', ['day', 'week', 'month'], '期間');
  }

  protected normalizeConfig(config: EnergyFlowCardConfig): EnergyFlowCardConfig {
    return config;
  }

  /** willUpdate refetches once REFRESH_MS has passed; the clock makes sure it runs. */
  protected override clockInterval(): number {
    return 60_000;
  }

  protected watchedEntities(): string[] {
    return [this.config.battery_entity].filter(Boolean) as string[];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 7;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width - (this.compact ? 28 : 40); // .card padding
      const k = w > 0 ? Math.min(1, Math.round((w / VB_W) * 100) / 100) : 1;
      if (k !== this.k) this.k = k;
    });
    this.ro.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.hass) return;
    // Another period or other sources: fetch now, not at the next REFRESH_MS.
    if (this.fetchKey() !== this.fetch.key || Date.now() - this.loadedAt > REFRESH_MS) this.load();
  }

  /** What the totals depend on in the config. */
  private fetchKey(): string {
    return JSON.stringify([this.config.period ?? 'day', this.config.sources]);
  }

  private readonly retry = () => this.load(true);

  private async load(force = false): Promise<void> {
    const key = this.fetchKey();
    if (!this.hass || (!force && this.fetch.isLoading(key))) return;
    if (this.fetch.shownKey !== key) this.f = undefined;
    this.loadedAt = Date.now();
    const hass = this.hass;
    const config = this.config;
    await this.fetch.run(
      key,
      async () => {
        const src = await loadSources(hass, { ...config.sources });
        const { start, end, period, buckets } = range(config.period ?? 'day');
        const ids = [...new Set([...src.grid_in, ...src.grid_out, ...src.solar, ...src.battery_in, ...src.battery_out])];
        const data = await statChanges(hass, ids, start, end, period, buckets);
        const total = (list: string[]) => sum(addSeries(data, list, buckets));
        return {
          present: { solar: src.solar.length > 0, grid: src.grid_in.length + src.grid_out.length > 0, battery: src.battery_in.length + src.battery_out.length > 0 },
          f: flows({
            solar: total(src.solar),
            gridIn: total(src.grid_in),
            gridOut: total(src.grid_out),
            batteryIn: total(src.battery_in),
            batteryOut: total(src.battery_out),
          }),
        };
      },
      ({ f, present }) => {
        this.present = present;
        this.f = f;
      },
    );
  }

  /** A total inside a node: the number, then a smaller unit so it fits the shape. */
  private amount(v: number) {
    return html`<span>${kwh(v)}<small>kWh</small></span>`;
  }

  /** A dot riding a path; bigger flows ride faster (2.4s for the largest, up to 6s). */
  private dot(path: string, cls: string, amount: number, max: number) {
    if (amount <= 0.005) return nothing;
    if (prefersReducedMotion()) return nothing;
    const dur = 6 - 3.6 * Math.min(1, amount / (max || 1));
    return svg`<circle r="5" class=${cls}>
      <animateMotion dur="${dur.toFixed(2)}s" repeatCount="indefinite" path=${path} keyPoints="0;1" keyTimes="0;1" calcMode="linear"></animateMotion>
    </circle>`;
  }

  /** Ring around the house: one arc per source, sized by its share. */
  private ring(f: Flows) {
    const [cx, cy] = NODE.home;
    const r = 38;
    const C = 2 * Math.PI * r;
    const parts = [
      { v: f.gridToHome, cls: 'c-grid' },
      { v: f.solarToHome, cls: 'c-solar' },
      { v: f.batteryToHome, cls: 'c-battery' },
    ].filter((p) => p.v > 0.005);
    const total = parts.reduce((a, p) => a + p.v, 0) || 1;
    const gap = parts.length > 1 ? 6 : 0;
    let offset = 0;
    return svg`
      <circle class="ring-track" cx=${cx} cy=${cy} r="32"></circle>
      ${parts.map((p) => {
        const len = Math.max(0, (p.v / total) * C - gap);
        const el = svg`<circle class="ring ${p.cls}" cx=${cx} cy=${cy} r=${r}
          transform="rotate(-90 ${cx} ${cy})"
          stroke-dasharray="${len} ${C - len}" stroke-dashoffset=${-offset - gap / 2}></circle>`;
        offset += (p.v / total) * C;
        return el;
      })}`;
  }

  private pos([x, y]: readonly [number, number]) {
    return `left:${(x / VB_W) * 100}%;top:${(y / VB_H) * 100}%`;
  }

  /** Just above a node of the given radius, which shrinks with --k like the node does. */
  private above([x, y]: readonly [number, number], radius: number) {
    return `left:${(x / VB_W) * 100}%;top:calc(${(y / VB_H) * 100}% - ${radius + 2}px * var(--k, 1))`;
  }

  protected renderCard() {
    const f = this.f;
    const soc = numState(this.stateObj(this.config.battery_entity));
    const head = html`<div class="head">
      <div>
        <p class="title">${this.config.title ?? 'エネルギーの流れ'}</p>
        <p class="sub">${PERIOD_LABEL[this.config.period ?? 'day']}</p>
      </div>
      ${f && f.home > 0
        ? html`<div class="self">
            <p class="k">自給率</p>
            <p class="v"><m3e-rolling-text .text=${`${Math.round(f.selfSufficiency * 100)}%`}></m3e-rolling-text></p>
          </div>`
        : nothing}
    </div>`;
    const status = html`<m3e-fetch-status
      .view=${this.fetch.view}
      subject="電力量の記録"
      emptyText="この期間の記録はまだありません"
      @retry=${this.retry}
    ></m3e-fetch-status>`;
    if (!f) {
      return html`<div class="card">
        ${head}
        ${this.fetch.status === 'error' ? status : html`<p class="empty">エネルギーの記録を読み込んでいます…</p>`}
      </div>`;
    }
    const p = this.present;
    const max = Math.max(f.gridToHome, f.solarToHome, f.solarToBattery, f.batteryToHome, f.solarToGrid);
    // Below 0.05 kWh the total would read "0.0", so leave the export out altogether.
    const exporting = f.gridOut >= 0.05;
    return html`<div class="card">
      ${head}
      <div class="flow" style="--k:${this.k}">
        <svg class="lines" viewBox="0 0 ${VB_W} ${VB_H}" aria-hidden="true">
          ${p.solar && p.grid && exporting && f.solarToGrid > 0.005 ? svg`<path class="line export c-solar" d=${PATH.solarToGrid} style="fill:none"></path>` : nothing}
          ${p.grid ? svg`<path class="line c-grid" d=${PATH.gridToHome} style="fill:none"></path>` : nothing}
          ${p.solar && p.battery ? svg`<path class="line c-solar" d=${PATH.solarToBattery} style="fill:none"></path>` : nothing}
          ${p.solar ? svg`<path class="line c-solar" d=${PATH.solarToHome} style="fill:none"></path>` : nothing}
          ${p.battery ? svg`<path class="line c-battery" d=${PATH.batteryToHome} style="fill:none"></path>` : nothing}
          ${this.dot(PATH.gridToHome, 'c-grid', f.gridToHome, max)}
          ${this.dot(PATH.solarToBattery, 'c-solar', f.solarToBattery, max)}
          ${this.dot(PATH.solarToHome, 'c-solar', f.solarToHome, max)}
          ${this.dot(PATH.batteryToHome, 'c-battery', f.batteryToHome, max)}
          ${this.ring(f)}
        </svg>
        ${p.solar
          ? html`<span class="label above" style="${this.above(NODE.solar, 38)}">太陽光</span>
              <div class="node solar" style=${this.pos(NODE.solar)}>
                <m3e-shape shape="cookie12" size="76" ?spin=${f.solar > 0}></m3e-shape>
                <div class="content"><m3e-icon icon="solar-power"></m3e-icon>${this.amount(f.solar)}</div>
              </div>`
          : nothing}
        ${p.grid
          ? html`<div class="node grid" style=${this.pos(NODE.grid)}>
                <div class="diamond"></div>
                <div class="content"><m3e-icon icon="bolt"></m3e-icon>${this.amount(f.gridIn)}</div>
              </div>
              <span class="label" style="${this.pos([0, 196])}">電力会社${exporting ? html`<small>売電 ${kwh(f.gridOut)} kWh</small>` : nothing}</span>`
          : nothing}
        <div class="node home" style=${this.pos(NODE.home)}>
          <div class="content"><m3e-icon icon="home"></m3e-icon>${this.amount(f.home)}</div>
        </div>
        <span class="label right" style="${this.pos([VB_W, 196])}">家</span>
        ${p.battery
          ? html`<div class="node battery" style=${this.pos(NODE.battery)}>
              <m3e-shape shape="pentagon" size="76"></m3e-shape>
              <div class="content"><m3e-icon icon="battery-full"></m3e-icon>${soc !== undefined ? `${Math.round(soc)}%` : `${kwh(f.batteryOut - f.batteryIn)}`}</div>
            </div>`
          : nothing}
      </div>
      ${p.battery
        ? html`<p class="caption" style="text-align:center"><b>蓄電池</b>充電 ${kwh(f.batteryIn)}／放電 ${kwh(f.batteryOut)} kWh</p>`
        : nothing}
      ${status}
    </div>`;
  }
}

define('m3e-energy-flow-card', M3eEnergyFlowCard);
