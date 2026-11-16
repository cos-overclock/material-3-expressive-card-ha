import { LitElement, css, html, svg } from 'lit';
import { property, query } from 'lit/decorators.js';
import { SPRINGS, SpringValue, prefersReducedMotion } from '../motion/spring';
import { define } from './define';

/**
 * M3 Expressive wavy linear progress. The played part is a sine wave that
 * travels while `playing`; pausing flattens the wave on the default spatial
 * spring (and it springs back on resume). The rest is a flat 4px track,
 * separated by a gap. Value changes glide on the effects spring.
 *
 * With `seekable`, it is also a slider. Like the M3 Expressive slider, a 4px
 * bar handle always marks the position (24px tall at rest, in its own gap).
 * Pressing grows it to 32px on the fast spatial spring and flattens the wave
 * so the position reads clearly; the played part follows the pointer, and
 * releasing brings the wave back. Arrow keys step by `keyStep`.
 *
 * Events (seekable): `input` while dragging, `change` on release / key.
 * detail { value } with value in 0..1.
 *
 * Colours: --m3e-progress-active (accent fill), --m3e-progress-track (default:
 * the active colour mixed 55% into the card surface, 6px thick;
 * --m3e-progress-track-width),
 * --m3e-progress-handle (on-surface).
 */
export class M3eWavyProgress extends LitElement {
  /** 0..1 */
  @property({ type: Number }) value = 0;
  @property({ type: Boolean, reflect: true }) playing = false;
  @property({ type: Number }) amplitude = 3;
  @property({ type: Number }) wavelength = 20;
  @property({ type: Boolean, reflect: true }) seekable = false;
  /** Fraction moved per arrow key. */
  @property({ type: Number }) keyStep = 0.02;
  @property() label = '';
  /** Text for screen readers, e.g. "2:18 / 3:52". */
  @property() valueText = '';

  @query('path.wave') private waveEl?: SVGPathElement;
  @query('line.rest') private restEl?: SVGLineElement;
  @query('rect.handle') private handleEl?: SVGRectElement;

  private width = 0;
  private phase = 0;
  private raf = 0;
  private ro?: ResizeObserver;
  private dragging = false;
  private amp = new SpringValue(0, SPRINGS.spatialDefault, () => this.draw());
  private progress = new SpringValue(0, SPRINGS.effectsDefault, () => this.draw());
  /** 0 = no handle, GRIP_REST = resting handle, 1 = pressed handle. */
  private grip = new SpringValue(0, SPRINGS.spatialFast, () => this.draw());

  static override styles = css`
    :host {
      display: block;
      position: relative;
      height: 16px;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }
    :host([seekable]) {
      cursor: pointer;
      touch-action: none;
      user-select: none;
    }
    :host(:focus-visible) svg {
      outline: 2px solid var(--m3e-progress-active, var(--accent-fill));
      outline-offset: 4px;
      border-radius: 8px;
    }
    /* 32px touch target that overflows the 16px track without taking layout
       space (padding on :host would be overridden by the card's box-sizing). */
    .hit {
      position: absolute;
      inset: -8px 0;
    }
    svg {
      position: relative;
      width: 100%;
      height: 16px;
      overflow: visible;
      display: block;
    }
    .wave {
      fill: none;
      stroke: var(--m3e-progress-active, var(--accent-fill));
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: stroke var(--m3e-effects-default);
    }
    .rest {
      /* Tinted with the active colour so it stands out from the card surface. */
      stroke: var(
        --m3e-progress-track,
        color-mix(in srgb, var(--m3e-progress-active, var(--accent-fill)) 55%, var(--m3-surface-container))
      );
      transition: stroke var(--m3e-effects-default);
      stroke-width: var(--m3e-progress-track-width, 6px);
      stroke-linecap: round;
    }
    .handle {
      fill: var(--m3e-progress-handle, var(--m3-on-surface));
      transition: fill var(--m3e-effects-default);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width;
      this.draw();
    });
    this.ro.observe(this);
    this.addEventListener('pointerdown', this.onDown);
    this.addEventListener('keydown', this.onKey);
    this.addEventListener('focus', this.onFocus);
    this.addEventListener('blur', this.onBlur);
    this.loop();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
    this.removeEventListener('pointerdown', this.onDown);
    this.removeEventListener('keydown', this.onKey);
    this.removeEventListener('focus', this.onFocus);
    this.removeEventListener('blur', this.onBlur);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.amp.stop();
    this.progress.stop();
    this.grip.stop();
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has('playing') || changed.has('amplitude')) this.updateAmplitude();
    if (changed.has('value') && !this.dragging) {
      const v = clamp01(this.value);
      if (changed.get('value') === undefined) this.progress.jump(v);
      else this.progress.set(v);
    }
    if (changed.has('seekable')) {
      if (!this.dragging) this.grip.set(this.gripRest);
      if (this.seekable) {
        this.tabIndex = 0;
        this.setAttribute('role', 'slider');
      } else {
        this.removeAttribute('tabindex');
        this.removeAttribute('role');
      }
    }
    if (this.seekable) {
      this.setAttribute('aria-valuemin', '0');
      this.setAttribute('aria-valuemax', '100');
      this.setAttribute('aria-valuenow', String(Math.round(clamp01(this.value) * 100)));
      if (this.valueText) this.setAttribute('aria-valuetext', this.valueText);
      if (this.label) this.setAttribute('aria-label', this.label);
    }
    this.loop();
  }

  private updateAmplitude(): void {
    // Flat while being dragged so the position is easy to read.
    this.amp.set(this.playing && !this.dragging ? this.amplitude : 0);
  }

  // ── seeking ───────────────────────────────────────────────

  private fractionAt(clientX: number): number {
    const r = this.getBoundingClientRect();
    return r.width ? clamp01((clientX - r.left) / r.width) : 0;
  }

  private emit(type: 'input' | 'change'): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.seekable || e.button !== 0) return;
    e.stopPropagation();
    this.setPointerCapture(e.pointerId);
    this.dragging = true;
    this.grip.set(1);
    this.updateAmplitude();
    this.value = this.fractionAt(e.clientX);
    this.progress.set(this.value, SPRINGS.spatialDefault); // tap: glide there
    this.emit('input');
    this.addEventListener('pointermove', this.onMove);
    this.addEventListener('pointerup', this.onUp);
    this.addEventListener('pointercancel', this.onUp);
  };

  private onMove = (e: PointerEvent): void => {
    const v = this.fractionAt(e.clientX);
    if (v === this.value) return;
    this.value = v;
    this.progress.set(v, SPRINGS.spatialFast);
    this.emit('input');
  };

  private onUp = (e: PointerEvent): void => {
    if (this.hasPointerCapture(e.pointerId)) this.releasePointerCapture(e.pointerId);
    this.removeEventListener('pointermove', this.onMove);
    this.removeEventListener('pointerup', this.onUp);
    this.removeEventListener('pointercancel', this.onUp);
    this.dragging = false;
    this.progress.spec = SPRINGS.effectsDefault;
    this.grip.set(this.matches(':focus-visible') ? 1 : this.gripRest);
    this.updateAmplitude();
    this.emit('change');
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.seekable) return;
    const delta: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    let next: number | undefined;
    if (e.key in delta) next = this.value + delta[e.key] * this.keyStep;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === undefined) return;
    e.preventDefault();
    this.value = clamp01(next);
    this.emit('change');
  };

  private onFocus = (): void => {
    if (this.seekable && this.matches(':focus-visible')) this.grip.set(1);
  };

  private onBlur = (): void => {
    if (!this.dragging) this.grip.set(this.gripRest);
  };

  /** Handle size at rest: shown whenever the bar can be dragged. */
  private get gripRest(): number {
    return this.seekable ? GRIP_REST : 0;
  }

  // ── drawing ───────────────────────────────────────────────

  private loop(): void {
    if (this.raf || !this.playing || prefersReducedMotion() || !this.isConnected) return;
    let last = performance.now();
    const tick = (now: number) => {
      this.phase += ((now - last) / 1000) * Math.PI * 2 * 0.6; // 0.6 cycles/s
      last = now;
      this.draw();
      this.raf = this.playing || this.amp.animating ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private draw(): void {
    if (!this.waveEl || !this.restEl || !this.width) return;
    const w = this.width;
    const cap = 2;
    const g = Math.max(0, this.grip.value);
    // The handle (4px) grows out of the gap, which widens to make room.
    const handleW = 4;
    const gap = 8 + g * (handleW + 4);
    const x1 = Math.max(cap, (w - cap) * this.progress.value);
    const amp = this.amp.value;
    const k = (Math.PI * 2) / this.wavelength;
    // Stop the played part short of the handle while it is shown.
    const waveEnd = Math.max(cap, x1 - g * (handleW / 2 + 4));
    let d = `M${cap} 8`;
    for (let x = cap + 2; x <= waveEnd; x += 2) {
      // Ease the amplitude in over the first wavelength so the start stays put.
      const ramp = Math.min(1, (x - cap) / this.wavelength);
      d += `L${x.toFixed(1)} ${(8 + Math.sin(this.phase - x * k) * amp * ramp).toFixed(2)}`;
    }
    this.waveEl.setAttribute('d', d);

    const restStart = Math.min(w - cap, waveEnd + gap + cap);
    this.restEl.setAttribute('x1', String(restStart));
    this.restEl.setAttribute('x2', String(w - cap));
    this.restEl.style.opacity = restStart >= w - cap ? '0' : '1';

    if (this.handleEl) {
      const h = 4 + g * 28; // 24px at rest, 32px pressed
      this.handleEl.setAttribute('x', String(x1 - handleW / 2));
      this.handleEl.setAttribute('y', String(8 - h / 2));
      this.handleEl.setAttribute('height', String(h));
      this.handleEl.style.opacity = String(Math.min(1, g / GRIP_REST));
    }
  }

  protected override render() {
    return html`${this.seekable ? html`<div class="hit"></div>` : ''}<svg aria-hidden="true">
      ${svg`<line class="rest" y1="8" y2="8"></line><path class="wave"></path>`}
      ${this.seekable ? svg`<rect class="handle" width="4" rx="2" height="4" style="opacity:0"></rect>` : ''}
    </svg>`;
  }
}

/** Resting handle: 4 + (20/28) × 28 = 24px tall. */
const GRIP_REST = 20 / 28;

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

define('m3e-wavy-progress', M3eWavyProgress);
