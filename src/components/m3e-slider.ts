import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SPRINGS, SpringValue } from '../motion/spring';
import { define } from './define';
import './m3e-icon';

/**
 * M3 Expressive slider, two variants from the design:
 *
 *  standard  active track (16/4 corners) · gap · 4px bar handle · gap ·
 *            inactive track (4/16 corners) with a stop dot. Optional icon
 *            inside the active track.
 *  gradient  one rounded gradient track (hue, saturation, colour temperature)
 *            with a 6px handle ringed in the card colour.
 *
 * A tap animates the value there on the default spatial spring; dragging
 * follows the pointer directly. Pressing narrows the handle (4 → 2px) as M3
 * Expressive specifies. External value updates also glide on the spring.
 *
 * Events: `input` while dragging, `change` on release / key press. detail { value }
 */
export class M3eSlider extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property() variant: 'standard' | 'gradient' = 'standard';
  /** CSS background for the gradient variant. */
  @property() gradient = '';
  @property() icon = '';
  @property({ type: Boolean }) stop = true;
  @property() label = '';
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private pressed = false;

  private dragging = false;
  private display = new SpringValue(0, SPRINGS.spatialDefault, (p) => this.style.setProperty('--p', String(p)));

  static override styles = css`
    :host {
      /* --m3e-slider-height (44px): the handle; the track is 12px shorter. */
      --h: var(--m3e-slider-height, 44px);
      --th: calc(var(--h) - 12px);
      --gap: var(--m3e-slider-gap, 4px);
      --hw: 4px;
      --p: 0;
      display: block;
      position: relative;
      height: var(--h);
      touch-action: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      outline: none;
    }
    :host([disabled]) {
      opacity: 0.38;
      pointer-events: none;
    }
    :host(:focus-visible) .handle {
      outline: 2px solid var(--accent-fill);
      outline-offset: 2px;
    }
    .standard {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      gap: var(--gap);
    }
    .active {
      height: var(--th);
      width: calc((100% - var(--hw) - 2 * var(--gap)) * var(--p));
      border-radius: calc(var(--th) / 2) 4px 4px calc(var(--th) / 2);
      background: var(--m3e-slider-active, var(--accent-shape));
      flex: none;
      transition: background-color var(--m3e-effects-default);
    }
    .handle {
      flex: none;
      width: var(--hw);
      height: var(--h);
      border-radius: 2px;
      background: var(--m3e-slider-handle, var(--accent-on-container));
      transition:
        width var(--m3e-spatial-fast),
        background-color var(--m3e-effects-default);
    }
    .inactive {
      flex: 1;
      height: var(--th);
      border-radius: 4px calc(var(--th) / 2) calc(var(--th) / 2) 4px;
      background: var(--m3e-slider-inactive, var(--accent-track));
      transition: background-color var(--m3e-effects-default);
    }
    .pressed {
      --hw: 2px;
    }
    m3e-icon {
      --m3e-icon-size: 18px;
      position: absolute;
      left: calc(var(--th) / 2 - 6px);
      top: calc(var(--h) / 2 - 9px);
      color: var(--m3e-slider-icon, var(--accent-on-shape));
      transition: color var(--m3e-effects-fast);
      pointer-events: none;
    }
    m3e-icon.outside {
      color: var(--m3e-slider-icon-outside, var(--accent-on-container));
    }
    .stop {
      position: absolute;
      right: calc(var(--th) / 2 - 4px);
      top: calc(var(--h) / 2 - 2px);
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--m3e-slider-active, var(--accent-shape));
      pointer-events: none;
    }
    .gradient-track {
      position: absolute;
      left: 0;
      right: 0;
      top: 6px;
      height: var(--th);
      border-radius: calc(var(--th) / 2);
      box-shadow: inset 0 0 0 1px var(--m3e-swatch-border);
    }
    .gradient .handle {
      --hw: 6px;
      position: absolute;
      top: 0;
      left: calc((100% - var(--hw)) * var(--p));
      border-radius: 3px;
      box-shadow: 0 0 0 3px var(--m3e-slider-ring, var(--accent-container));
    }
    .gradient.pressed .handle {
      --hw: 4px;
    }
  `;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if ((changed.has('value') || changed.has('min') || changed.has('max')) && !this.dragging) {
      const p = this.fraction(this.value);
      if (changed.get('value') === undefined && !this.display.animating && this.display.value === 0) this.display.jump(p);
      else this.display.set(p);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.tabIndex = this.disabled ? -1 : 0;
    this.setAttribute('role', 'slider');
    this.addEventListener('pointerdown', this.onDown);
    this.addEventListener('keydown', this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this.onDown);
    this.removeEventListener('keydown', this.onKey);
    this.display.stop();
  }

  protected override updated(): void {
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    if (this.label) this.setAttribute('aria-label', this.label);
  }

  private fraction(v: number): number {
    return this.max === this.min ? 0 : Math.min(1, Math.max(0, (v - this.min) / (this.max - this.min)));
  }

  private valueAt(clientX: number): number {
    const r = this.getBoundingClientRect();
    const gradient = this.variant === 'gradient';
    const hw = gradient ? 6 : 4;
    const gap = gradient ? 0 : parseFloat(getComputedStyle(this).getPropertyValue('--gap')) || 4;
    const usable = r.width - hw - 2 * gap;
    const p = Math.min(1, Math.max(0, (clientX - r.left - gap - hw / 2) / usable));
    const raw = this.min + p * (this.max - this.min);
    const stepped = Math.round(raw / this.step) * this.step;
    return Math.min(this.max, Math.max(this.min, +stepped.toFixed(4)));
  }

  private emit(type: 'input' | 'change'): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  private onDown = (e: PointerEvent): void => {
    if (this.disabled || e.button !== 0) return;
    e.stopPropagation();
    this.setPointerCapture(e.pointerId);
    this.pressed = true;
    this.dragging = true;
    this.value = this.valueAt(e.clientX);
    this.display.set(this.fraction(this.value)); // tap: glide there
    this.emit('input');
    this.addEventListener('pointermove', this.onMove);
    this.addEventListener('pointerup', this.onUp);
    this.addEventListener('pointercancel', this.onUp);
  };

  private onMove = (e: PointerEvent): void => {
    const v = this.valueAt(e.clientX);
    if (v === this.value) return;
    this.value = v;
    // Follow the finger, but keep the spring's velocity so release is smooth.
    this.display.set(this.fraction(v), SPRINGS.spatialFast);
    this.emit('input');
  };

  private onUp = (e: PointerEvent): void => {
    this.releasePointerCapture(e.pointerId);
    this.removeEventListener('pointermove', this.onMove);
    this.removeEventListener('pointerup', this.onUp);
    this.removeEventListener('pointercancel', this.onUp);
    this.pressed = false;
    this.dragging = false;
    this.display.spec = SPRINGS.spatialDefault;
    this.emit('change');
  };

  private onKey = (e: KeyboardEvent): void => {
    const big = (this.max - this.min) / 10;
    const delta: Record<string, number> = {
      ArrowRight: this.step,
      ArrowUp: this.step,
      ArrowLeft: -this.step,
      ArrowDown: -this.step,
      PageUp: big,
      PageDown: -big,
    };
    let next: number | undefined;
    if (e.key in delta) next = this.value + delta[e.key];
    else if (e.key === 'Home') next = this.min;
    else if (e.key === 'End') next = this.max;
    if (next === undefined) return;
    e.preventDefault();
    this.value = Math.min(this.max, Math.max(this.min, next));
    this.emit('change');
  };

  protected override render() {
    if (this.variant === 'gradient') {
      return html`<div class="gradient ${this.pressed ? 'pressed' : ''}">
        <div class="gradient-track" style="background:${this.gradient}"></div>
        <div class="handle"></div>
      </div>`;
    }
    const outside = this.fraction(this.value) < 0.12;
    return html`<div class="standard ${this.pressed ? 'pressed' : ''}">
        <div class="active"></div>
        <div class="handle"></div>
        <div class="inactive"></div>
      </div>
      ${this.icon ? html`<m3e-icon class=${outside ? 'outside' : ''} icon=${this.icon}></m3e-icon>` : nothing}
      ${this.stop && this.fraction(this.value) < 0.95 ? html`<div class="stop"></div>` : nothing}`;
  }
}

define('m3e-slider', M3eSlider);
