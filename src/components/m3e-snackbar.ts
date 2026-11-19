import { LitElement, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { motionTokens } from '../motion/motion-css';
import { themeTokens } from '../theme/tokens';
import { define } from './define';

export interface SnackbarOptions {
  message: string;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
  theme?: 'latte' | 'mocha';
}

const DEFAULT_DURATION_MS = 5000;

/**
 * Suite-wide M3E snackbar mounted once on `document.body`, used for undoable
 * actions such as garbage check-offs and maintenance mutes.
 */
export class M3eSnackbar extends LitElement {
  @state() private opts?: SnackbarOptions;
  @state() private open = false;
  private timer?: ReturnType<typeof setTimeout>;

  static override styles = [
    motionTokens,
    themeTokens,
    css`
      :host {
        position: fixed;
        left: 0;
        right: 0;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        display: flex;
        justify-content: center;
        padding: 0 16px;
        pointer-events: none;
        z-index: 9999;
        font-family: var(--m3e-font-plain);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: min(560px, calc(100vw - 32px));
        min-height: 48px;
        padding: 6px 8px 6px 16px;
        border-radius: 14px;
        background: var(--m3-inverse-surface);
        color: var(--m3-inverse-on-surface);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
        font: 500 14px / 20px var(--m3e-font-plain);
        opacity: 0;
        transform: translateY(14px);
        transition:
          transform var(--m3e-spatial-fast),
          opacity var(--m3e-effects-fast);
        pointer-events: none;
      }
      .bar.open {
        opacity: 1;
        transform: none;
        pointer-events: auto;
      }
      .msg {
        flex: 1;
        min-width: 0;
      }
      .action {
        all: unset;
        box-sizing: border-box;
        flex: none;
        padding: 8px 12px;
        border-radius: 12px;
        color: #b4befe;
        font: 600 13px / 18px var(--m3e-font-plain);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      :host([theme='mocha']) .action {
        color: #1e66f5;
      }
      .action:hover {
        background: rgba(127, 127, 127, 0.16);
      }
      .action:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        .bar {
          transition: none;
        }
      }
    `,
  ];

  show(opts: SnackbarOptions): void {
    clearTimeout(this.timer);
    this.setAttribute('theme', opts.theme ?? 'latte');
    this.opts = opts;
    this.open = true;
    this.timer = setTimeout(() => this.hide(), opts.durationMs ?? DEFAULT_DURATION_MS);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.open = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private act = (): void => {
    const fn = this.opts?.action?.onAction;
    this.hide();
    fn?.();
  };

  protected override render() {
    const o = this.opts;
    return html`<div class="bar ${this.open ? 'open' : ''}" role="status" aria-live="polite">
      ${o
        ? html`<span class="msg">${o.message}</span>
            ${o.action && this.open ? html`<button class="action" @click=${this.act}>${o.action.label}</button>` : nothing}`
        : nothing}
    </div>`;
  }
}

define('m3e-snackbar', M3eSnackbar);

let instance: M3eSnackbar | undefined;

export function showSnackbar(opts: SnackbarOptions): M3eSnackbar | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  if (!instance || !instance.isConnected) {
    instance = document.createElement('m3e-snackbar') as M3eSnackbar;
    document.body.appendChild(instance);
  }
  instance.show(opts);
  return instance;
}

export function hideSnackbar(): void {
  instance?.hide();
}
