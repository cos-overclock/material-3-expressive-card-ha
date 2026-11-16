import { css, html, nothing, svg, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { areaName } from '../ha/helpers';
import { addSeries, energySources, flows, kwh, mergeSources, range, statChanges, sum } from '../ha/energy';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { SPRINGS, SpringValue } from '../motion/spring';
import { define } from '../components/define';
import type { GroupOption } from '../components/m3e-button-group';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-button-group';

interface AreaConfig {
  name: string;
  color?: Accent;
  /** Statistic ids of the devices in this area. */
  devices: string[];
}

export interface EnergySankeyCardConfig extends BaseCardConfig {
  title?: string;
  subtitle?: string;
  /** Group devices into areas yourself. Default: by each device's area in HA. */
  areas?: AreaConfig[];
  /** Device names, keyed by statistic id. */
  names?: Record<string, string>;
  /** Devices shown per area; the rest are summed as "ほか". Default 4. */
  max_devices?: number;
  period?: 'day' | 'week' | 'month';
  sources?: Partial<Record<'grid_in' | 'grid_out' | 'solar' | 'battery_in' | 'battery_out', string | string[]>>;
  footnote?: string;
}

type Kind = 'day' | 'week' | 'month';
const PERIODS: GroupOption[] = [
  { value: 'day', label: '日', ariaLabel: '今日' },
  { value: 'week', label: '週', ariaLabel: '今週' },
  { value: 'month', label: '月', ariaLabel: '今月' },
];
const AREA_COLORS: Accent[] = ['lavender', 'teal', 'sky', 'pink', 'peach', 'yellow', 'mauve'];
const OTHER = '__other__';
const REFRESH_MS = 10 * 60_000;

interface Model {
  sources: { key: string; label: string; color: string; value: number }[];
  home: number;
  areas: { key: string; label: string; color: string; value: number; devices: { key: string; label: string; value: number }[] }[];
}

interface NodeBox {
  key: string;
  col: number;
  y: number;
  h: number;
  color: string;
  label: string;
  value: number;
}

interface LinkBox {
  key: string;
  from: string;
  to: string;
  y0: number;
  y1: number;
  h: number;
  color: string;
}

interface Layout {
  nodes: Map<string, NodeBox>;
  links: Map<string, LinkBox>;
}

const COLUMN_GAP = [14, 0, 10, 5];
const H = 340;
const BAR = 8;

function layout(m: Model): Layout {
  const cols: { key: string; value: number; color: string; label: string }[][] = [
    m.sources.map((s) => ({ key: `s:${s.key}`, value: s.value, color: s.color, label: s.label })),
    [{ key: 'home', value: m.home, color: 'var(--m3-on-surface-variant)', label: '家' }],
    m.areas.map((a) => ({ key: `a:${a.key}`, value: a.value, color: a.color, label: a.label })),
    m.areas.flatMap((a) => a.devices.map((d) => ({ key: `d:${a.key}:${d.key}`, value: d.value, color: a.color, label: d.label }))),
  ];
  const total = Math.max(m.home, 0.001);
  // One scale for every column, so a kWh is the same height everywhere.
  const scale = Math.min(...cols.map((c, i) => (H - Math.max(0, c.length - 1) * COLUMN_GAP[i]) / total));
  const nodes = new Map<string, NodeBox>();
  cols.forEach((col, ci) => {
    const used = col.reduce((a, n) => a + n.value * scale, 0) + Math.max(0, col.length - 1) * COLUMN_GAP[ci];
    let y = (H - used) / 2;
    for (const n of col) {
      const h = n.value * scale;
      nodes.set(n.key, { key: n.key, col: ci, y, h, color: n.color, label: n.label, value: n.value });
      y += h + COLUMN_GAP[ci];
    }
  });
  const links = new Map<string, LinkBox>();
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  const link = (from: string, to: string, value: number, color: string) => {
    const a = nodes.get(from)!;
    const b = nodes.get(to)!;
    const h = value * scale;
    const y0 = a.y + (out.get(from) ?? 0);
    const y1 = b.y + (inn.get(to) ?? 0);
    out.set(from, (out.get(from) ?? 0) + h);
    inn.set(to, (inn.get(to) ?? 0) + h);
    links.set(`${from}>${to}`, { key: `${from}>${to}`, from, to, y0, y1, h, color });
  };
  m.sources.forEach((s) => link(`s:${s.key}`, 'home', s.value, s.color));
  m.areas.forEach((a) => link('home', `a:${a.key}`, a.value, a.color));
  m.areas.forEach((a) => a.devices.forEach((d) => link(`a:${a.key}`, `d:${a.key}:${d.key}`, d.value, a.color)));
  return { nodes, links };
}

/** Interpolate two layouts by key; boxes that come or go grow from / shrink to zero height. */
function mix(a: Layout, b: Layout, t: number): Layout {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const nodes = new Map<string, NodeBox>();
  for (const key of new Set([...a.nodes.keys(), ...b.nodes.keys()])) {
    const p = a.nodes.get(key);
    const q = b.nodes.get(key);
    const base = (q ?? p)!;
    nodes.set(key, { ...base, y: lerp(p?.y ?? q!.y, q?.y ?? p!.y), h: lerp(p?.h ?? 0, q?.h ?? 0), value: q?.value ?? 0 });
  }
  const links = new Map<string, LinkBox>();
  for (const key of new Set([...a.links.keys(), ...b.links.keys()])) {
    const p = a.links.get(key);
    const q = b.links.get(key);
    const base = (q ?? p)!;
    links.set(key, { ...base, y0: lerp(p?.y0 ?? q!.y0, q?.y0 ?? p!.y0), y1: lerp(p?.y1 ?? q!.y1, q?.y1 ?? p!.y1), h: lerp(p?.h ?? 0, q?.h ?? 0) });
  }
  return { nodes, links };
}

const accentVar = (a: Accent) => `var(--acc-${a})`;

/**
 * Where the energy was used: sources → house → areas → devices as a Sankey
 * diagram, for today, this week or this month. Untracked use (the house total
 * minus every metered device) is shown under その他 as 未計測.
 *
 * Motion: switching 日 / 週 / 月 morphs every bar and ribbon to its new size
 * and place on the default spatial spring (new items grow out of zero);
 * tapping a node highlights everything that flows through it and dims the rest.
 */
export class M3eEnergySankeyCard extends M3eBaseCard<EnergySankeyCardConfig> {
  static override accentHint = '見出しのアイコンと期間の切り替えボタンの色を変えます。グラフの色は変わりません。';

  @state() private period: Kind = 'day';
  @state() private shown?: Layout;
  @state() private highlight?: string;
  @state() private width = 336;
  private from?: Layout;
  private to?: Layout;
  private morph = new SpringValue(1, SPRINGS.spatialDefault, (t) => {
    if (this.from && this.to) this.shown = mix(this.from, this.to, t);
  });
  private cache = new Map<string, { at: number; model: Model }>();
  private ro?: ResizeObserver;
  private requested = '';

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .head m3e-shape {
        --m3e-shape-color: var(--acc-green);
        color: var(--acc-on-green);
      }
      .text {
        flex: 1;
        min-width: 0;
      }
      .title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      .sub {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      m3e-button-group {
        --m3e-group-height: 40px;
        --m3e-group-radius: 12px;
        --m3e-group-selected-radius: 20px;
        --m3e-group-gap: 2px;
        --m3e-group-font-size: 14px;
        width: 112px;
        flex: none;
      }
      .plot {
        position: relative;
        width: 100%;
        height: ${H}px;
      }
      svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .ribbon {
        fill-opacity: 0.32;
        transition: fill-opacity var(--m3e-effects-default);
        cursor: pointer;
      }
      .bar {
        cursor: pointer;
        transition: opacity var(--m3e-effects-default);
      }
      .dim {
        fill-opacity: 0.08;
      }
      .bar.dim {
        opacity: 0.3;
      }
      text {
        fill: var(--m3-on-surface);
        font: 500 13px var(--m3e-font-plain);
        pointer-events: none;
        transition: opacity var(--m3e-effects-default);
      }
      text .v {
        font-family: var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      text.device {
        font-weight: 400;
      }
      text.dim {
        opacity: 0.35;
      }
      .foot {
        font: 400 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .empty {
        display: grid;
        place-items: center;
        height: 120px;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .head {
        gap: 10px;
      }
      :host([compact]) .title {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) m3e-button-group {
        --m3e-group-height: 36px;
        width: 104px;
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-energy-sankey-card' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'period', selector: { select: { options: ['day', 'week', 'month'] } } },
        { name: 'max_devices', selector: { number: { min: 1, max: 10, mode: 'box' } } },
        { name: 'areas', selector: { object: {} } },
      ],
    };
  }

  protected normalizeConfig(config: EnergySankeyCardConfig): EnergySankeyCardConfig {
    if (config.period) this.period = config.period;
    return config;
  }

  protected watchedEntities(): string[] {
    return [];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 8;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w && w !== this.width) this.width = w;
    });
    this.updateComplete.then(() => {
      const plot = this.renderRoot.querySelector('.plot');
      if (plot) this.ro?.observe(plot);
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
    this.morph.stop();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.hass) return;
    const cached = this.cache.get(this.period);
    const key = `${this.period}`;
    if ((!cached || Date.now() - cached.at > REFRESH_MS) && this.requested !== key) {
      this.requested = key;
      this.load(this.period).finally(() => (this.requested = ''));
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const plot = this.renderRoot.querySelector('.plot');
    if (plot && this.ro) this.ro.observe(plot);
  }

  private async load(kind: Kind): Promise<void> {
    const hass = this.hass!;
    try {
      const src = mergeSources(await energySources(hass), { ...this.config.sources });
      const { start, end, period, buckets } = range(kind);
      const deviceIds = this.config.areas ? this.config.areas.flatMap((a) => a.devices) : src.devices.map((d) => d.stat);
      const ids = [...new Set([...src.grid_in, ...src.grid_out, ...src.solar, ...src.battery_in, ...src.battery_out, ...deviceIds])];
      const data = await statChanges(hass, ids, start, end, period, buckets);
      const total = (list: string[]) => sum(addSeries(data, list, buckets));
      const f = flows({
        solar: total(src.solar),
        gridIn: total(src.grid_in),
        gridOut: total(src.grid_out),
        batteryIn: total(src.battery_in),
        batteryOut: total(src.battery_out),
      });
      const hasSources = src.solar.length + src.grid_in.length + src.battery_out.length > 0;
      const deviceTotal = sum(deviceIds.map((id) => sum(data[id] ?? [])));
      const home = hasSources ? f.home : deviceTotal;
      const sources = [
        { key: 'solar', label: '太陽光', color: accentVar('yellow'), value: f.solarToHome },
        { key: 'battery', label: '蓄電池', color: accentVar('green'), value: f.batteryToHome },
        { key: 'grid', label: '電力会社', color: accentVar('blue'), value: f.gridToHome },
      ].filter((s) => s.value > 0.005);
      this.cache.set(kind, { at: Date.now(), model: { sources, home, areas: this.groupAreas(data, deviceIds, src.devices, home) } });
      if (kind === this.period) this.show(kind);
    } catch (e) {
      console.warn('m3e-energy-sankey-card: statistics unavailable', e);
    }
  }

  private groupAreas(
    data: Record<string, number[]>,
    deviceIds: string[],
    named: { stat: string; name?: string }[],
    home: number,
  ): Model['areas'] {
    const nameOf = (id: string) =>
      this.config.names?.[id] ?? named.find((d) => d.stat === id)?.name ?? (this.hass!.states[id]?.attributes.friendly_name as string) ?? id;
    const groups: { key: string; label: string; color?: Accent; ids: string[] }[] = [];
    if (this.config.areas) {
      this.config.areas.forEach((a, i) => groups.push({ key: `cfg${i}`, label: a.name, color: a.color, ids: a.devices }));
    } else {
      for (const id of deviceIds) {
        const area = areaName(this.hass, id) ?? OTHER;
        let g = groups.find((x) => x.key === area);
        if (!g) groups.push((g = { key: area, label: area === OTHER ? 'その他' : area, ids: [] }));
        g.ids.push(id);
      }
    }
    const max = this.config.max_devices ?? 4;
    let areas = groups.map((g) => {
      const devs = g.ids.map((id) => ({ key: id, label: nameOf(id), value: sum(data[id] ?? []) })).filter((d) => d.value > 0.005);
      devs.sort((a, b) => b.value - a.value);
      const shown = devs.slice(0, max);
      const rest = sum(devs.slice(max).map((d) => d.value));
      if (rest > 0.005) shown.push({ key: '__rest__', label: 'ほか', value: rest });
      return { key: g.key, label: g.label, color: g.color, value: sum(shown.map((d) => d.value)), devices: shown };
    });
    // What no meter accounts for goes under その他 as 未計測.
    const untracked = home - sum(areas.map((a) => a.value));
    let other = areas.find((a) => a.key === OTHER);
    if (untracked > 0.05) {
      if (!other) areas.push((other = { key: OTHER, label: 'その他', color: undefined, value: 0, devices: [] }));
      other.devices.push({ key: '__untracked__', label: '未計測', value: untracked });
      other.value += untracked;
    }
    areas = areas.filter((a) => a.value > 0.005);
    areas.sort((a, b) => (a.key === OTHER ? 1 : b.key === OTHER ? -1 : b.value - a.value));
    let ci = 0;
    return areas.map((a) => ({
      ...a,
      color: a.key === OTHER ? 'var(--m3-outline)' : accentVar(a.color ?? AREA_COLORS[ci++ % AREA_COLORS.length]),
    }));
  }

  private show(kind: Kind): void {
    const model = this.cache.get(kind)?.model;
    if (!model) return;
    const next = layout(model);
    if (!this.shown) {
      this.from = this.to = next;
      this.shown = next;
      return;
    }
    this.from = this.shown;
    this.to = next;
    this.morph.jump(0);
    this.morph.set(1);
  }

  private choose(kind: Kind): void {
    if (kind === this.period) return;
    this.period = kind;
    this.highlight = undefined;
    if (this.cache.has(kind)) this.show(kind);
  }

  /** Columns' x positions for the current width; the device labels after the last column get the room they need. */
  private columns(l: Layout): number[] {
    const w = this.width;
    // Rough text width at 13px: full-width characters ≈ 13px, others ≈ 7.5px.
    const textW = (t: string) => [...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e7f ? 13 : 7.5), 0);
    const longest = Math.max(0, ...[...l.nodes.values()].filter((n) => n.col === 3).map((n) => textW(`${n.label} ${kwh(n.value)}`)));
    const labelW = Math.min(w * 0.34, Math.max(66, longest + 10));
    const last = w - labelW - BAR;
    // Area labels sit between the area and device columns (two lines: name, value).
    const areaW = Math.max(
      60,
      ...[...l.nodes.values()].filter((n) => n.col === 2).map((n) => Math.max(textW(n.label), textW(`${kwh(n.value)} kWh`))),
    );
    const areaX = Math.min(last * 0.71, last - areaW - BAR - 14);
    return [0, areaX / 2, areaX, last];
  }

  private related(key: string, focus: string, l: Layout): boolean {
    if (key === focus) return true;
    const link = l.links.get(key);
    if (link) {
      // A ribbon is related if it touches the focus or lies on a path through it.
      if (link.from === focus || link.to === focus) return true;
      return this.upstream(link.from, focus, l) || this.downstream(link.to, focus, l);
    }
    return this.upstream(key, focus, l) || this.downstream(key, focus, l);
  }

  /** Is `focus` reachable downstream of `key`? */
  private upstream(key: string, focus: string, l: Layout): boolean {
    for (const link of l.links.values()) if (link.from === key && (link.to === focus || this.upstream(link.to, focus, l))) return true;
    return false;
  }

  /** Is `focus` reachable upstream of `key`? */
  private downstream(key: string, focus: string, l: Layout): boolean {
    for (const link of l.links.values()) if (link.to === key && (link.from === focus || this.downstream(link.from, focus, l))) return true;
    return false;
  }

  private renderPlot(l: Layout) {
    const xs = this.columns(l);
    const f = this.highlight;
    const dim = (key: string) => (f && !this.related(key, f, l) ? 'dim' : '');
    const tap = (key: string) => () => (this.highlight = this.highlight === key ? undefined : key);
    const ribbons = [...l.links.values()].map((k) => {
      const a = l.nodes.get(k.from)!;
      const b = l.nodes.get(k.to)!;
      const x0 = xs[a.col] + BAR;
      const x1 = xs[b.col];
      const mx = (x0 + x1) / 2;
      const d = `M${x0},${k.y0} C${mx},${k.y0} ${mx},${k.y1} ${x1},${k.y1} L${x1},${k.y1 + k.h} C${mx},${k.y1 + k.h} ${mx},${k.y0 + k.h} ${x0},${k.y0 + k.h} Z`;
      return svg`<path class="ribbon ${dim(k.key)}" d=${d} style="fill:${k.color}" @click=${tap(k.to)}></path>`;
    });
    const bars = [...l.nodes.values()].map(
      (n) =>
        svg`<rect class="bar ${dim(n.key)}" x=${xs[n.col]} y=${n.y} width=${BAR} height=${Math.max(0, n.h)} rx="4" style="fill:${n.color}" @click=${tap(n.key)}></rect>`,
    );
    const labels = [...l.nodes.values()].map((n) => {
      if (n.h < 0.5) return nothing;
      const x = xs[n.col] + BAR + 8;
      const cls = dim(n.key);
      if (n.col === 3) {
        return svg`<text class="device ${cls}" x=${x} y=${n.y + n.h / 2} dominant-baseline="central">${n.label} <tspan class="v">${kwh(n.value)}</tspan></text>`;
      }
      const unit = n.col === 1 ? '' : ' kWh';
      const cy = n.y + n.h / 2;
      if (n.h < 34) {
        return svg`<text class=${cls} x=${x} y=${cy} dominant-baseline="central">${n.label} <tspan class="v">${kwh(n.value)}</tspan></text>`;
      }
      return svg`<text class=${cls} x=${x} y=${cy - 9} dominant-baseline="central">${n.label}<tspan class="v" x=${x} dy="19">${kwh(n.value)}${unit}</tspan></text>`;
    });
    return svg`${ribbons}${bars}${labels}`;
  }

  protected override render() {
    const l = this.shown;
    return html`<div class="card">
      <div class="head">
        <m3e-shape shape="cookie9" size=${this.compact ? 36 : 44}><m3e-icon icon="devices"></m3e-icon></m3e-shape>
        <div class="text">
          <p class="title">${this.config.title ?? 'どこで使われたか'}</p>
          <p class="sub">${this.config.subtitle ?? '供給元 → エリア → デバイス'}</p>
        </div>
        <m3e-button-group
          data-accent=${this.config.color ?? 'green'}
          label="期間"
          .options=${PERIODS}
          .value=${this.period}
          @select=${(e: CustomEvent) => this.choose(e.detail.value)}
        ></m3e-button-group>
      </div>
      ${l
        ? html`<div class="plot" @click=${(e: Event) => e.target === e.currentTarget && (this.highlight = undefined)}>
            <svg viewBox="0 0 ${this.width} ${H}" aria-label="エネルギーの使われ方" role="img">${this.renderPlot(l)}</svg>
          </div>`
        : html`<div class="plot"><p class="empty">エネルギーの記録を読み込んでいます…</p></div>`}
      ${this.config.footnote === ''
        ? nothing
        : html`<p class="foot">${this.config.footnote ?? '単位：kWh　未計測：個別の電力センサーがない機器の消費'}</p>`}
    </div>`;
  }
}

define('m3e-energy-sankey-card', M3eEnergySankeyCard);
