import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from './define';

/**
 * M3 switch (52×32) from the design. Off: outlined track and a 16px handle.
 * On: filled track (--accent-shape) and a 24px handle (--accent-on-shape).
 * Pressing grows the handle to 28px. Handle travel and size ride the fast
 * spatial spring, so they overshoot slightly; colours use the effects spring.
 *
 * Colour hooks (on): --m3e-switch-track, --m3e-switch-handle.
 *
 * Fires `change` with detail { checked } when toggled by the user.
 */
export class M3eSwitch extends LitElement {
  @property({ type: Boolean, reflect: true }) checked = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property() label = '';
  @state() private pressed = false;

  static override styles = css`
    :host {
      display: inline-flex;
      flex: none;
      -webkit-tap-highlight-color: transparent;
    }
    button {
      all: unset;
      box-sizing: border-box;
      position: relative;
      width: 52px;
      height: 32px;
      border-radius: 16px;
      cursor: pointer;
      background: var(--m3-surface-highest);
      box-shadow: inset 0 0 0 2px var(--m3-outline);
      transition:
        background-color var(--m3e-effects-default),
        box-shadow var(--m3e-effects-default);
      touch-action: manipulation;
    }
    button:focus-visible {
      outline: 2px solid var(--accent-fill);
      outline-offset: 2px;
    }
    .handle {
      position: absolute;
      top: 50%;
      left: 0;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--m3-outline);
      transform: translate(8px, -50%);
      transition:
        transform var(--m3e-spatial-fast),
        width var(--m3e-spatial-fast),
        height var(--m3e-spatial-fast),
        background-color var(--m3e-effects-default);
    }
    :host([checked]) button {
      background: var(--m3e-switch-track, var(--accent-shape));
      box-shadow: inset 0 0 0 2px transparent;
    }
    :host([checked]) .handle {
      width: 24px;
      height: 24px;
      background: var(--m3e-switch-handle, var(--accent-on-shape));
      transform: translate(24px, -50%);
    }
    .pressed .handle {
      width: 28px;
      height: 28px;
      transform: translate(2px, -50%); /* centred on the off handle (x 16) */
    }
    :host([checked]) .pressed .handle {
      transform: translate(22px, -50%); /* centred on the on handle (x 36) */
    }
    :host([disabled]) button {
      opacity: 0.38;
      cursor: default;
    }
  `;

  private toggle(e: Event): void {
    e.stopPropagation();
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('change', { detail: { checked: !this.checked }, bubbles: true, composed: true }));
  }

  private down = (e: PointerEvent) => {
    e.stopPropagation();
    if (this.disabled || e.button !== 0) return;
    this.pressed = true;
  };
  private up = () => {
    this.pressed = false;
  };

  protected override render() {
    return html`<button
      role="switch"
      aria-checked=${this.checked ? 'true' : 'false'}
      aria-label=${this.label || nothing}
      class=${this.pressed ? 'pressed' : ''}
      ?disabled=${this.disabled}
      @click=${this.toggle}
      @pointerdown=${this.down}
      @pointerup=${this.up}
      @pointerleave=${this.up}
      @pointercancel=${this.up}
    >
      <span class="handle"></span>
    </button>`;
  }
}

define('m3e-switch', M3eSwitch);
