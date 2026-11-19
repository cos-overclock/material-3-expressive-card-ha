import { LitElement, css, html, nothing, svg, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SPRINGS, springTransition, prefersReducedMotion } from '../motion/spring';
import { define } from './define';
import { attachSwipeShield, capturePointer, releasePointer, SliderIntent } from './gesture';

const W = 1000;
const H = 100;

/** Monotone cubic (Fritsch–Carlson) path through the points: smooth, never overshoots the data. */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  const f = (v: number) => +v.toFixed(2);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + m[i] * h)} ${f(x1 - h)},${f(y1 - m[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/**
 * A smooth line chart that stretches to its box: optional area fill, grid
 * lines and an end dot. With `scrub`, touching or hovering shows a marker at
 * the nearest sample and fires `scrub` { index } (index null on leave).
 *
 * Motion: the line wipes in from the left on the slow effects spring when
 * data first arrives; later data morphs the path on the default spatial
 * spring (where the browser can animate `d`).
 *
 * Colours: --m3e-chart-line (accent fill), --m3e-chart-area, --m3e-chart-grid.
 */
export class M3eLineChart extends LitElement {
  @property({ attribute: false }) values: (number | null)[] = [];
  @property({ type: Number }) min?: number;
  @property({ type: Number }) max?: number;
  /** Smallest y span, so a flat series isn't blown up into noise. */
  @property({ type: Number }) minSpan = 1;
  @property({ type: Boolean }) area = false;
  @property({ type: Boolean }) dot = false;
  @property({ type: Number }) grid = 0;
  @property({ type: Boolean }) scrub = false;
  @property({ type: Number }) strokeWidth = 3;
  @state() private hover: number | null = null;

  private revealed = false;
  private scrubbing = false;
  private scrubPointerId?: number;
  private readonly intent = new SliderIntent();
  private detachShield?: () => void;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      height: 100px;
      touch-action: pan-y;
    }
    .plot {
      position: absolute;
      inset: 0;
    }
    .plot.hidden {
      clip-path: inset(0 100% 0 0);
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .line {
      fill: none;
      stroke: var(--m3e-chart-line, var(--accent-fill));
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      transition:
        d var(--m3e-spatial-default),
        stroke var(--m3e-effects-default);
    }
    .area {
      fill: var(--m3e-chart-area, color-mix(in srgb, var(--m3e-chart-line, var(--accent-fill)) 20%, transparent));
      stroke: none;
      transition:
        d var(--m3e-spatial-default),
        fill var(--m3e-effects-default);
    }
    .grid {
      stroke: var(--m3e-chart-grid, var(--m3-outline-variant));
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .dot,
    .marker-dot {
      position: absolute;
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      border-radius: 50%;
      background: var(--m3e-chart-line, var(--accent-fill));
      transition:
        top var(--m3e-spatial-default),
        background-color var(--m3e-effects-default);
    }
    .marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      margin-left: -1px;
      border-radius: 1px;
      background: var(--m3-on-surface);
      opacity: 0.6;
      pointer-events: none;
    }
    .marker-dot {
      box-shadow: 0 0 0 3px var(--m3e-chart-ring, var(--m3-surface-container));
      transition: none;
      pointer-events: none;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.detachShield = attachSwipeShield(this, () => this.scrub);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detachShield?.();
    this.detachShield = undefined;
    this.intent.reset();
    this.scrubbing = false;
    this.scrubPointerId = undefined;
    this.hover = null;
  }

  private range(): [number, number] {
    const vals = this.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    let lo = this.min ?? Math.min(...vals);
    let hi = this.max ?? Math.max(...vals);
    if (!vals.length) [lo, hi] = [0, 1];
    if (hi - lo < this.minSpan) {
      const mid = (hi + lo) / 2;
      lo = this.min ?? mid - this.minSpan / 2;
      hi = this.max ?? mid + this.minSpan / 2;
    }
    const pad = (hi - lo) * 0.12;
    lo = this.min ?? lo - pad;
    hi = this.max ?? hi + pad;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
    if (hi <= lo) hi = lo + (this.minSpan > 0 ? this.minSpan : 1);
    return [lo, hi];
  }

  /** Points in the 1000×100 viewBox (y down). */
  private points(lo: number, hi: number): [number, number][] {
    const n = this.values.length;
    const out: [number, number][] = [];
    this.values.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      out.push([n > 1 ? (i / (n - 1)) * W : W, H - ((v - lo) / (hi - lo || 1)) * H]);
    });
    return out;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('values') && this.hover !== null && (!this.scrubbing || this.hover >= this.values.length || this.values[this.hover] == null)) {
      this.hover = null;
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    const count = this.values.reduce<number>((n, v) => n + (typeof v === 'number' && Number.isFinite(v) ? 1 : 0), 0);
    if (changed.has('values') && !this.revealed && count >= 4) {
      this.revealed = true;
      const plot = this.renderRoot.querySelector('.plot') as HTMLElement | null;
      if (!plot || typeof plot.animate !== 'function' || prefersReducedMotion()) return;
      const t = springTransition(SPRINGS.effectsSlow);
      plot.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
        duration: Math.max(t.duration, 700),
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    }
  }

  private indexAt(e: PointerEvent): number | null {
    const n = this.values.length;
    if (!n) return null;
    const r = this.getBoundingClientRect();
    if (r.width <= 0) return null;
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(p * (n - 1));
    // Snap to the nearest sample that has data.
    for (let d = 0; d < n; d++) {
      if (typeof this.values[i - d] === 'number' && Number.isFinite(this.values[i - d])) return i - d;
      if (typeof this.values[i + d] === 'number' && Number.isFinite(this.values[i + d])) return i + d;
    }
    return null;
  }

  private setHover(i: number | null): void {
    if (i === this.hover) return;
    this.hover = i;
    this.dispatchEvent(new CustomEvent('scrub', { detail: { index: i }, bubbles: true, composed: true }));
  }

  private onDown = (e: PointerEvent) => {
    if (!this.scrub || e.button !== 0) return;
    this.scrubPointerId = e.pointerId;
    if (this.intent.down(e)) {
      this.scrubbing = true;
      capturePointer(e.currentTarget as Element, e.pointerId);
      this.setHover(this.indexAt(e));
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.scrub) return;
    if ((!e.pointerType || e.pointerType === 'mouse') && !this.scrubbing) {
      this.setHover(this.indexAt(e));
      return;
    }
    if (this.scrubPointerId !== undefined && e.pointerId !== this.scrubPointerId) return;
    const res = this.intent.move(e);
    if (res === 'start') {
      this.scrubbing = true;
      capturePointer(e.currentTarget as Element, e.pointerId);
      this.setHover(this.indexAt(e));
    } else if (res === 'drag') {
      this.setHover(this.indexAt(e));
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.scrubPointerId !== undefined && e.pointerId !== this.scrubPointerId) return;
    releasePointer(e.currentTarget as Element, e.pointerId);
    this.intent.up(e);
    this.scrubbing = false;
    this.scrubPointerId = undefined;
    if (this.scrub && e.pointerType !== 'mouse') this.setHover(null);
  };

  private onLeave = (e: PointerEvent) => {
    if (this.scrubbing && e.type === 'pointerleave') return;
    if (this.scrubPointerId !== undefined && e.pointerId !== this.scrubPointerId) return;
    if (e.type === 'pointercancel') {
      releasePointer(e.currentTarget as Element, e.pointerId);
      this.intent.cancel(e);
    } else {
      this.intent.reset();
    }
    this.scrubbing = false;
    this.scrubPointerId = undefined;
    if (this.scrub) this.setHover(null);
  };

  protected override render() {
    const [lo, hi] = this.range();
    const all = this.points(lo, hi);
    // Too little history (a sensor added minutes ago) draws a sliver at the
    // right edge that reads as a glitch. Draw no line until there is a trend.
    const pts = all.length >= 4 ? all : [];
    const line = monotonePath(pts);
    const areaPath = pts.length ? `${line}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z` : '';
    const last = all[all.length - 1];
    const n = this.values.length;
    const hv = this.hover !== null ? this.values[this.hover] : null;
    return html`<div
      class="plot ${this.revealed || !pts.length ? '' : 'hidden'}"
      @pointermove=${this.onMove}
      @pointerdown=${this.onDown}
      @pointerup=${this.onUp}
      @pointerleave=${this.onLeave}
      @pointercancel=${this.onLeave}
    >
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${Array.from({ length: this.grid }, (_, i) => {
          const y = this.grid === 1 ? H : (i / (this.grid - 1)) * H;
          return svg`<line class="grid" x1="0" x2=${W} y1=${y} y2=${y}></line>`;
        })}
        ${this.area && areaPath ? svg`<path class="area" d=${areaPath} style="d:path('${areaPath}')"></path>` : nothing}
        ${line ? svg`<path class="line" d=${line} style="d:path('${line}');stroke-width:${this.strokeWidth}px"></path>` : nothing}
      </svg>
      ${this.dot && last && this.hover === null
        ? html`<div class="dot" style="left:${(last[0] / W) * 100}%;top:${(last[1] / H) * 100}%"></div>`
        : nothing}
      ${this.hover !== null && hv != null
        ? html`<div class="marker" style="left:${(this.hover / Math.max(1, n - 1)) * 100}%"></div>
            <div
              class="marker-dot"
              style="left:${(this.hover / Math.max(1, n - 1)) * 100}%;top:${(1 - (hv - lo) / (hi - lo || 1)) * 100}%"
            ></div>`
        : nothing}
    </div>`;
  }
}

define('m3e-line-chart', M3eLineChart);
