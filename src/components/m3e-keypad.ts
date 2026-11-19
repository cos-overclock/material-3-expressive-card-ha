import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from './define';
import './m3e-icon';

/**
 * PIN pad shared by the lock and alarm cards: dots and a 3×4 keypad for
 * numeric codes, a password field for text codes.
 *
 * Events: `pin-submit` { code } on ✓ / Enter, `pin-cancel` on やめる / Escape,
 * `pin-input` on every key (so the host can clear its error).
 * The host calls `clear()` after a wrong code and `shake()` to say so.
 */
export class M3eKeypad extends LitElement {
  /** What the code is for: "解錠", "警備を解除"… */
  @property() verb = '';
  /** Digits (dots + keys) or free text (password field). */
  @property({ type: Boolean }) numeric = true;
  /** Error from HA, shown in the header. The host clears it on `pin-input`. */
  @property() error = '';
  /** Smaller keys (the cards' compact density). */
  @property({ type: Boolean, reflect: true }) compact = false;
  @state() private pin = '';

  static override styles = css`
    :host {
      display: block;
    }
    .pad {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 24px;
      background: var(--m3-surface-high);
      color: var(--m3-on-surface);
    }
    .pad.shake {
      animation: shake 420ms;
    }
    @keyframes shake {
      0%,
      100% {
        transform: translateX(0);
      }
      20% {
        transform: translateX(-8px);
      }
      40% {
        transform: translateX(7px);
      }
      60% {
        transform: translateX(-5px);
      }
      80% {
        transform: translateX(3px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pad.shake {
        animation: none;
      }
    }
    :host([compact]) .pad {
      padding: 12px;
      gap: 10px;
      border-radius: 20px;
    }
    :host([compact]) .key {
      height: 44px;
      border-radius: 14px;
      font-size: 20px;
    }
    :host([compact]) .key.small {
      font-size: 14px;
    }
    :host([compact]) .key:active {
      border-radius: 22px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font: 500 14px / 20px var(--m3e-font-plain);
    }
    .err {
      color: var(--acc-red);
      font-weight: 400;
      font-size: 13px;
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 12px;
      height: 16px;
    }
    .dots i {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px var(--m3-outline);
      transition:
        background-color var(--m3e-effects-fast),
        box-shadow var(--m3e-effects-fast),
        transform var(--m3e-spatial-fast);
    }
    .dots i.on {
      background: var(--m3-on-surface);
      box-shadow: none;
      transform: scale(1.15);
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      direction: ltr;
    }
    .key {
      all: unset;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      height: var(--m3e-key-height, 52px);
      border-radius: 16px;
      background: var(--m3-surface-highest);
      color: var(--m3-on-surface);
      font: 500 22px / 1 var(--m3e-font-brand);
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition:
        border-radius var(--m3e-spatial-fast),
        background-color var(--m3e-effects-default);
    }
    .key:focus-visible {
      outline: 2px solid var(--accent-fill);
      outline-offset: 2px;
    }
    .key:active {
      border-radius: 26px;
    }
    .key.small {
      font: 500 14px / 1 var(--m3e-font-plain);
    }
    .key.go {
      background: var(--accent-fill);
      color: var(--accent-on-fill);
    }
    .key[disabled] {
      opacity: 0.38;
      pointer-events: none;
    }
    input {
      height: 44px;
      border-radius: 12px;
      border: 1px solid var(--m3-outline);
      padding: 0 12px;
      font: inherit;
      background: var(--m3-surface-container);
      color: var(--m3-on-surface);
    }
  `;

  /** Empty the field (after a wrong code, or when the pad closes). */
  clear(): void {
    this.pin = '';
  }

  /** Shake the pad once: the code was wrong. */
  shake(): void {
    const pad = this.renderRoot.querySelector('.pad');
    if (!pad) return;
    pad.classList.remove('shake');
    void (pad as HTMLElement).offsetWidth;
    pad.classList.add('shake');
  }

  /** Focus the first key or the text field, for keyboard users. */
  override focus(): void {
    this.renderRoot.querySelector<HTMLElement>('input, .key')?.focus();
  }

  private press(k: string): void {
    this.dispatchEvent(new CustomEvent('pin-input', { bubbles: true, composed: true }));
    if (k === 'clear') this.pin = this.pin.slice(0, -1);
    else if (this.pin.length < 12) this.pin += k;
  }

  private submit(): void {
    if (!this.pin) return;
    this.dispatchEvent(new CustomEvent('pin-submit', { detail: { code: this.pin }, bubbles: true, composed: true }));
  }

  private cancel(): void {
    this.pin = '';
    this.dispatchEvent(new CustomEvent('pin-cancel', { bubbles: true, composed: true }));
  }

  private onKey(e: KeyboardEvent): void {
    if (this.numeric && /^\d$/.test(e.key)) this.press(e.key);
    else if (this.numeric && e.key === 'Backspace') this.press('clear');
    else if (e.key === 'Enter') {
      // Let focused buttons handle Enter via their own click handler instead of double-firing or mis-submitting.
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      this.submit();
    } else if (e.key === 'Escape') this.cancel();
  }

  protected override render() {
    const verb = this.verb;
    return html`<div class="pad" @keydown=${this.onKey} @animationend=${(e: AnimationEvent) => (e.currentTarget as HTMLElement).classList.remove('shake')}>
      <div class="head">
        <span>${verb}の暗証番号</span>
        ${this.error ? html`<span class="err" role="alert">${this.error}</span>` : nothing}
      </div>
      ${this.numeric
        ? html`<div class="dots" role="status" aria-live="polite" aria-label="${this.pin.length}桁入力済み">
              ${Array.from({ length: Math.max(4, this.pin.length) }, (_, i) => html`<i class=${i < this.pin.length ? 'on' : ''}></i>`)}
            </div>
            <div class="keys">
              ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => html`<button type="button" class="key" @click=${() => this.press(k)}>${k}</button>`)}
              <button type="button" class="key small" @click=${this.cancel}>やめる</button>
              <button type="button" class="key" @click=${() => this.press('0')}>0</button>
              ${this.pin
                ? html`<button type="button" class="key go" aria-label=${verb} @click=${this.submit}><m3e-icon icon="check"></m3e-icon></button>`
                : html`<button type="button" class="key small" disabled>${verb}</button>`}
            </div>
            <button
              type="button"
              class="key small"
              style="height:36px"
              ?disabled=${!this.pin}
              @click=${() => this.press('clear')}
            >
              1文字消す
            </button>`
        : html`<input
              type="password"
              autocomplete="off"
              aria-label="${verb}の暗証番号"
              .value=${this.pin}
              @input=${(e: InputEvent) => {
                this.pin = (e.target as HTMLInputElement).value;
                this.dispatchEvent(new CustomEvent('pin-input', { bubbles: true, composed: true }));
              }}
            />
            <div class="keys">
              <button type="button" class="key small" @click=${this.cancel}>やめる</button>
              <span></span>
              <button type="button" class="key go small" ?disabled=${!this.pin} @click=${this.submit}>${verb}</button>
            </div>`}
    </div>`;
  }
}

define('m3e-keypad', M3eKeypad);

declare global {
  interface HTMLElementTagNameMap {
    'm3e-keypad': M3eKeypad;
  }
}
