import { LitElement, css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { hhmm } from '../ha/helpers';
import type { FetchView } from '../ha/fetch-state';
import { define } from './define';
import './m3e-icon';

/** "12:34" today, "11/15 12:34" on another day. */
export function updatedLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const n = new Date(now);
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hhmm(d) : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`;
}

/**
 * The status as a short phrase for a card's own subtitle ("14:40 更新",
 * "読み込み中…", "履歴なし"), or '' for idle and error (an error gets its own row).
 */
export function statusPhrase(view: FetchView, emptyText = 'データなし', now = Date.now()): string {
  const at = view.updatedAt ? updatedLabel(view.updatedAt, now) : '';
  switch (view.status) {
    case 'loading':
      return at ? `${at} 更新・更新中…` : '読み込み中…';
    case 'ok':
      return at ? `${at} 更新` : '';
    case 'empty':
      return emptyText;
    default:
      return '';
  }
}

/**
 * Where a card's fetched data stands: when it was last updated, that it is
 * loading, that there is nothing to show, or that the fetch failed, with a
 * retry button. Fires `retry` when the button is pressed.
 *
 *  line  (default) one line of small text; a failure becomes a red row.
 *  icon  only shows a failure, as a small icon button (for compact cards).
 */
export class M3eFetchStatus extends LitElement {
  @property({ attribute: false }) view: FetchView = { status: 'idle', hasData: false };
  @property({ reflect: true }) variant: 'line' | 'icon' = 'line';
  /** What `empty` means on this card, e.g. "この期間のデータはありません". Empty: the card shows that itself. */
  @property() emptyText = '表示できるデータがありません';
  /** What failed, e.g. "履歴". Read before "を取得できませんでした". */
  @property() subject = 'データ';
  /** Show only a failure (for data that refreshes itself, where the time adds nothing). */
  @property({ type: Boolean, attribute: 'only-errors' }) onlyErrors = false;

  static override styles = css`
    :host {
      display: block;
      min-width: 0;
      font: 400 12px / 16px var(--m3e-font-plain);
      color: var(--m3-on-surface-variant);
    }
    :host([variant='icon']) {
      display: contents;
    }
    p {
      margin: 0;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      font-variant-numeric: tabular-nums;
    }
    .line .txt {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .line m3e-icon {
      --m3e-icon-size: 14px;
      flex: none;
    }
    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spin {
        animation: none;
      }
    }
    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 12px;
      border-radius: 12px;
      background: var(--acc-red-container);
      color: var(--acc-on-red-container);
      font: 400 13px / 18px var(--m3e-font-plain);
    }
    .error > m3e-icon {
      --m3e-icon-size: 18px;
      flex: none;
    }
    .error .msg {
      flex: 1;
      min-width: 0;
    }
    .error small {
      display: block;
      font: 400 12px / 16px var(--m3e-font-plain);
      opacity: 0.85;
    }
    button {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: none;
      cursor: pointer;
      border-radius: 999px;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: transform var(--m3e-spatial-fast, 150ms);
    }
    button:active {
      transform: scale(0.95);
    }
    button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    .retry {
      height: 32px;
      padding: 0 12px 0 8px;
      /* A tonal button on the red row: readable on Latte's and Mocha's containers alike. */
      background: color-mix(in srgb, currentColor 14%, transparent);
      color: inherit;
      font: 500 13px / 1 var(--m3e-font-plain);
    }
    .retry m3e-icon {
      --m3e-icon-size: 18px;
    }
    .icon-only {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--acc-red);
    }
    .icon-only::after {
      content: '';
      position: absolute;
      inset: -8px;
    }
    .icon-only m3e-icon {
      --m3e-icon-size: 18px;
    }
  `;

  private stopPointer = (e: Event): void => {
    e.stopPropagation();
  };

  private retry(e: Event): void {
    // The card behind a compact status runs its own tap action otherwise.
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('retry', { bubbles: true, composed: true }));
  }

  protected override render() {
    const { status, updatedAt, hasData } = this.view;
    const at = updatedAt ? updatedLabel(updatedAt) : '';
    if (this.variant === 'icon') {
      if (status !== 'error') return nothing;
      const label = `${this.subject}を取得できませんでした。もう一度試す`;
      return html`<button
        type="button"
        class="icon-only"
        part="retry"
        aria-label=${label}
        title=${label}
        @pointerdown=${this.stopPointer}
        @pointerup=${this.stopPointer}
        @click=${this.retry}
      >
        <m3e-icon icon="cloud-off"></m3e-icon>
      </button>`;
    }
    if (this.onlyErrors && status !== 'error') return nothing;
    switch (status) {
      case 'idle':
        return nothing;
      case 'loading':
        return html`<p class="line" role="status">
          <m3e-icon class="spin" icon="sync"></m3e-icon><span class="txt">${at ? `${at} 更新・更新中…` : '読み込み中…'}</span>
        </p>`;
      case 'ok':
        return at ? html`<p class="line"><span class="txt">${at} 更新</span></p>` : nothing;
      case 'empty':
        // No emptyText: the card says it itself, so only the time is left.
        if (this.emptyText) return html`<p class="line"><span class="txt">${this.emptyText}${at ? `（${at} 確認）` : ''}</span></p>`;
        return at ? html`<p class="line"><span class="txt">${at} 更新</span></p>` : nothing;
      case 'error':
        return html`<div class="error" role="alert">
          <m3e-icon icon="error"></m3e-icon>
          <p class="msg">
            ${this.subject}を取得できませんでした
            ${hasData && at ? html`<small>${at} 時点のデータを表示しています</small>` : nothing}
          </p>
          <button
            type="button"
            class="retry"
            part="retry"
            @pointerdown=${this.stopPointer}
            @pointerup=${this.stopPointer}
            @click=${this.retry}
          >
            <m3e-icon icon="sync"></m3e-icon>再試行
          </button>
        </div>`;
    }
  }
}

define('m3e-fetch-status', M3eFetchStatus);

declare global {
  interface HTMLElementTagNameMap {
    'm3e-fetch-status': M3eFetchStatus;
  }
}
