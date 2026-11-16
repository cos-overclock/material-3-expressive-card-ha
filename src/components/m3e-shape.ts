import { LitElement, css, html, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import { SPRINGS, SpringValue } from '../motion/spring';
import { SAMPLES, SHAPES, morphRadii, radiiToPath, shapePeriod, shapeRadii, type ShapeName } from '../shapes/shapes';
import { define } from './define';

/**
 * An M3 Expressive shape container. Changing `shape` morphs the outline on the
 * default spatial spring while rotating it by one symmetry period, so the
 * finished shape lands in the same orientation as the design. Slot content
 * (usually an icon) stays centred and upright.
 *
 *   <m3e-shape shape="cookie9" size="44"><m3e-icon icon="lightbulb"></m3e-icon></m3e-shape>
 *
 * Colour: --m3e-shape-color (transitions on the effects spring).
 */
export class M3eShape extends LitElement {
  @property() shape: ShapeName = 'circle';
  @property({ type: Number }) size = 44;
  /** Scales the shape down slightly while true (press feedback). */
  @property({ type: Boolean, reflect: true }) pressed = false;
  /** Rotate continuously (e.g. a running appliance). */
  @property({ type: Boolean, reflect: true }) spin = false;

  @query('path') private pathEl?: SVGPathElement;
  @query('svg') private svgEl?: SVGSVGElement;

  private current = new Float32Array(SAMPLES);
  private from = new Float32Array(SAMPLES);
  private to = new Float32Array(SAMPLES);
  private rotation = 0;
  private rotationTarget = 0;
  private spinRaf = 0;

  private progress = new SpringValue(1, SPRINGS.spatialDefault, (p) => {
    morphRadii(this.from, this.to, p, this.current);
    this.pathEl?.setAttribute('d', radiiToPath(this.current, this.size));
  });

  private rotor = new SpringValue(0, SPRINGS.spatialDefault, (deg) => {
    this.rotation = deg;
    this.applyRotation();
  });

  static override styles = css`
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      flex: none;
      transition: transform var(--m3e-spatial-fast);
    }
    :host([pressed]) {
      transform: scale(0.9);
    }
    svg {
      position: absolute;
      inset: 0;
      overflow: visible;
    }
    path {
      fill: var(--m3e-shape-color, var(--accent-shape));
      stroke: var(--m3e-shape-stroke, none);
      stroke-width: var(--m3e-shape-stroke-width, 0);
      transition:
        fill var(--m3e-effects-default),
        stroke var(--m3e-effects-default),
        stroke-width var(--m3e-spatial-fast);
    }
    ::slotted(*) {
      position: relative;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.spin) this.startSpin();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.progress.stop();
    this.rotor.stop();
    cancelAnimationFrame(this.spinRaf);
    this.spinRaf = 0;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('shape')) return;
    const next = shapeRadii(this.shape in SHAPES ? this.shape : 'circle');
    if (changed.get('shape') === undefined) {
      // First render: no morph.
      this.current.set(next);
      this.from.set(next);
      this.to.set(next);
      return;
    }
    this.from.set(this.current);
    this.to.set(next);
    this.progress.jump(0);
    this.progress.set(1);
    const period = shapePeriod(SHAPES[this.shape]) || 45;
    this.rotationTarget += period;
    this.rotor.set(this.rotationTarget);
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('size')) {
      this.style.width = this.style.height = `${this.size}px`;
      this.pathEl?.setAttribute('d', radiiToPath(this.current, this.size));
    }
    if (changed.has('spin')) {
      if (this.spin) this.startSpin();
      else this.stopSpin();
    }
  }

  private applyRotation(): void {
    if (this.svgEl) this.svgEl.style.transform = `rotate(${this.rotation}deg)`;
  }

  private startSpin(): void {
    if (this.spinRaf || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!this.rotor.animating) {
        this.rotation += dt * 24; // deg/s: slow, ambient
        this.rotationTarget = this.rotation;
        this.rotor.value = this.rotation;
        this.rotor.target = this.rotation;
        this.applyRotation();
      }
      this.spinRaf = requestAnimationFrame(tick);
    };
    this.spinRaf = requestAnimationFrame(tick);
  }

  private stopSpin(): void {
    cancelAnimationFrame(this.spinRaf);
    this.spinRaf = 0;
    // Settle onto the nearest symmetric orientation.
    const period = shapePeriod(SHAPES[this.shape]) || 360;
    this.rotationTarget = Math.round(this.rotation / period) * period;
    this.rotor.value = this.rotation;
    this.rotor.set(this.rotationTarget);
  }

  protected override render() {
    const d = radiiToPath(this.current, this.size);
    return html`<svg width=${this.size} height=${this.size} viewBox="0 0 ${this.size} ${this.size}" aria-hidden="true">
        <path d=${d}></path>
      </svg>
      <slot></slot>`;
  }
}

define('m3e-shape', M3eShape);
