import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { define } from './define';
import './m3e-icon';

export interface GroupOption {
  value: string;
  label?: string;
  icon?: string;
  /** Show the icon only while selected (HVAC modes in the design). */
  iconWhenSelected?: boolean;
  /** Draw an air-vane line at this angle (deg) instead of a label. */
  vane?: number;
  /** Size to content instead of sharing the row equally. */
  hug?: boolean;
  /** Secondary line (e.g. "2700K"). */
  sub?: string;
  /** Small colour swatch before the label. */
  swatch?: string;
  ariaLabel?: string;
}

/**
 * M3 Expressive button group (single select).
 *
 * Pressing a button widens it (flex-grow 1 → 1.3) while its neighbours give
 * way, and rounds its corners; release springs back with a little overshoot.
 * Selection changes colour on the effects spring and corner radius on the
 * spatial spring.
 *
 * Styling hooks:
 *   --m3e-group-height (48px)  --m3e-group-gap (4px)
 *   --m3e-group-radius (8px)   --m3e-group-selected-radius (= radius)
 *   --m3e-group-pressed-radius (16px)
 *   --m3e-group-bg / -fg, --m3e-group-selected-bg / -fg
 *   --m3e-group-font-size (13px)
 */
export class M3eButtonGroup extends LitElement {
  @property({ attribute: false }) options: GroupOption[] = [];
  @property() value = '';
  @property() label = '';
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private pressed = '';

  static override styles = css`
    :host {
      display: flex;
      gap: var(--m3e-group-gap, 4px);
      height: var(--m3e-group-height, 48px);
      -webkit-tap-highlight-color: transparent;
    }
    :host([disabled]) {
      opacity: 0.38;
      pointer-events: none;
    }
    button {
      all: unset;
      box-sizing: border-box;
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--m3e-group-inner-gap, 4px);
      padding: 0 8px;
      border-radius: var(--m3e-group-radius, 8px);
      background: var(--m3e-group-bg, var(--m3-surface-high));
      color: var(--m3e-group-fg, var(--m3-on-surface));
      font: 500 var(--m3e-group-font-size, 13px) / 1.2 var(--m3e-font-plain);
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        flex-grow var(--m3e-spatial-fast),
        border-radius var(--m3e-spatial-fast),
        background-color var(--m3e-effects-default),
        color var(--m3e-effects-default);
    }
    button.hug {
      flex: 0 0 auto;
      padding: 0 12px 0 8px;
    }
    button:focus-visible {
      outline: 2px solid var(--m3e-group-selected-bg, var(--accent-fill));
      outline-offset: 2px;
    }
    button[aria-checked='true'] {
      background: var(--m3e-group-selected-bg, var(--accent-fill));
      color: var(--m3e-group-selected-fg, var(--accent-on-fill));
      border-radius: var(--m3e-group-selected-radius, var(--m3e-group-radius, 8px));
      font-weight: var(--m3e-group-selected-weight, 500);
    }
    button.pressed {
      flex-grow: 1.3;
      border-radius: var(--m3e-group-pressed-radius, 16px);
    }
    button.hug.pressed {
      padding: 0 16px 0 12px;
    }
    m3e-icon {
      --m3e-icon-size: 18px;
    }
    .vane {
      width: 18px;
      height: 3px;
      border-radius: 1.5px;
      background: currentColor;
      opacity: 0.8;
      transition: transform var(--m3e-spatial-default);
    }
    .stack {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
    }
    .sub {
      font: 500 11px / 14px var(--m3e-font-brand);
      opacity: 0.85;
    }
    button[aria-checked='true'] .sub {
      opacity: 1;
    }
    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex: none;
      box-shadow: inset 0 0 0 1px var(--m3e-swatch-border);
      transition: box-shadow var(--m3e-effects-default);
    }
    button[aria-checked='true'] .swatch {
      box-shadow: inset 0 0 0 1.5px var(--m3e-group-selected-fg, var(--accent-on-fill));
    }
  `;

  private select(opt: GroupOption): void {
    if (opt.value === this.value) return;
    this.value = opt.value;
    this.dispatchEvent(new CustomEvent('select', { detail: { value: opt.value }, bubbles: true, composed: true }));
  }

  private onKey(e: KeyboardEvent, index: number): void {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = this.options[(index + dir + this.options.length) % this.options.length];
    this.select(next);
    (this.renderRoot.querySelectorAll('button')[this.options.indexOf(next)] as HTMLElement)?.focus();
  }

  private content(opt: GroupOption, selected: boolean) {
    if (opt.vane !== undefined) return html`<span class="vane" style="transform: rotate(${opt.vane}deg)"></span>`;
    const showIcon = opt.icon && (!opt.iconWhenSelected || selected);
    const text = opt.sub
      ? html`<span class="stack"><span>${opt.label}</span><span class="sub">${opt.sub}</span></span>`
      : opt.label
        ? html`<span>${opt.label}</span>`
        : nothing;
    return html`${opt.swatch ? html`<span class="swatch" style="background:${opt.swatch}"></span>` : nothing}
    ${showIcon ? html`<m3e-icon icon=${opt.icon!}></m3e-icon>` : nothing}${text}`;
  }

  protected override render() {
    return html`${repeat(
      this.options,
      (o) => o.value,
      (opt, i) => {
        const selected = opt.value === this.value;
        return html`<button
          role="radio"
          aria-checked=${selected ? 'true' : 'false'}
          aria-label=${opt.ariaLabel ?? opt.label ?? opt.value}
          tabindex=${selected || (!this.value && i === 0) ? 0 : -1}
          class="${opt.hug ? 'hug' : ''} ${this.pressed === opt.value ? 'pressed' : ''}"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.select(opt);
          }}
          @pointerdown=${(e: PointerEvent) => {
            e.stopPropagation();
            this.pressed = opt.value;
          }}
          @pointerup=${() => (this.pressed = '')}
          @pointerleave=${() => (this.pressed = '')}
          @pointercancel=${() => (this.pressed = '')}
          @keydown=${(e: KeyboardEvent) => this.onKey(e, i)}
        >
          ${this.content(opt, selected)}
        </button>`;
      },
    )}`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'radiogroup');
    if (this.label) this.setAttribute('aria-label', this.label);
  }
}

define('m3e-button-group', M3eButtonGroup);
