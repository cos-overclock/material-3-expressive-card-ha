import { css } from 'lit';

/**
 * The pieces most multi-control cards share: a padded column card, a header
 * (shape, name and state, something on the right), chips, a two-column stat
 * row, and the compact density. Matches the vacuum, water-heater and climate
 * cards.
 */
export const richCardStyles = css`
  .card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header .tap {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .header m3e-shape {
    --m3e-shape-color: var(--accent-fill);
    color: var(--accent-on-fill);
  }
  [data-accent='neutral'] .header m3e-shape {
    --m3e-shape-color: var(--m3-surface-highest);
    color: var(--m3-on-surface-variant);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    font: 500 16px / 22px var(--m3e-font-plain);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .state {
    font: 400 13px / 18px var(--m3e-font-plain);
    color: var(--accent-fill);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color var(--m3e-effects-default);
  }
  [data-accent='neutral'] .state {
    color: var(--m3-on-surface-variant);
  }
  .round-btn {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: var(--accent-container);
    color: var(--accent-on-container);
  }
  .round-btn:active {
    border-radius: 12px;
  }
  [data-accent='neutral'] .round-btn {
    background: var(--m3-surface-high);
    color: var(--m3-on-surface);
  }
  .icon-btn[disabled] {
    opacity: 0.38;
    pointer-events: none;
  }
  .section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font: 500 13px / 20px var(--m3e-font-plain);
  }
  .section-label .current {
    color: var(--accent-fill);
    font-variant-numeric: tabular-nums;
  }
  [data-accent='neutral'] .section-label .current {
    color: var(--m3-on-surface-variant);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    max-width: 100%;
    padding: 6px 12px 6px 10px;
    border-radius: 10px;
    background: var(--m3-surface-high);
    color: var(--m3-on-surface);
    font: 500 13px / 18px var(--m3e-font-plain);
    -webkit-tap-highlight-color: transparent;
    transition:
      border-radius var(--m3e-spatial-fast),
      background-color var(--m3e-effects-default),
      color var(--m3e-effects-default);
  }
  button.chip,
  .chip[role='button'] {
    cursor: pointer;
  }
  button.chip:active,
  .chip[role='button']:active {
    border-radius: 18px;
  }
  .chip:focus-visible {
    outline: 2px solid var(--accent-fill);
    outline-offset: 2px;
  }
  .chip span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip m3e-icon {
    --m3e-icon-size: 18px;
    flex: none;
    color: var(--m3-on-surface-variant);
  }
  .chip.on {
    background: var(--accent-container);
    color: var(--accent-on-container);
  }
  .chip.on m3e-icon {
    color: inherit;
  }
  .chip.warn {
    background: var(--acc-peach-container);
    color: var(--acc-on-peach-container);
  }
  .chip.alert {
    background: var(--acc-red-container);
    color: var(--acc-on-red-container);
  }
  .chip.warn m3e-icon,
  .chip.alert m3e-icon {
    color: inherit;
  }
  .chip[disabled] {
    opacity: 0.38;
    pointer-events: none;
  }
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    margin-top: -16px;
    transition:
      grid-template-rows var(--m3e-spatial-default),
      margin-top var(--m3e-spatial-default);
  }
  .fold.open {
    grid-template-rows: 1fr;
    margin-top: 0;
  }
  .fold > div {
    min-height: 0;
    overflow: hidden;
  }
  .big {
    font: 600 56px / 60px var(--m3e-font-brand);
    letter-spacing: -1px;
    font-variant-numeric: tabular-nums;
  }
  .step {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--m3-surface-high);
    color: var(--m3-on-surface);
    --m3e-icon-size: 26px;
  }
  .step.plus {
    background: var(--accent-fill);
    color: var(--accent-on-fill);
  }
  [data-accent='neutral'] .step.plus {
    background: var(--m3-surface-high);
    color: var(--m3-on-surface);
  }
  .step:active {
    border-radius: 28px;
  }
  m3e-slider {
    --m3e-slider-height: 44px;
    --m3e-slider-active: var(--accent-fill);
    --m3e-slider-inactive: var(--m3-surface-highest);
    --m3e-slider-handle: var(--m3-on-surface);
  }
  .empty {
    font: 400 13px / 20px var(--m3e-font-plain);
    color: var(--m3-on-surface-variant);
  }

  /* ---- compact density (phones and tablets) ---- */
  :host([compact]) .card {
    padding: 16px;
    gap: 12px;
  }
  :host([compact]) .header,
  :host([compact]) .header .tap {
    gap: 10px;
  }
  :host([compact]) .name {
    font: 500 15px / 20px var(--m3e-font-plain);
  }
  :host([compact]) .state {
    font: 400 12px / 16px var(--m3e-font-plain);
  }
  :host([compact]) .round-btn {
    width: 40px;
    height: 40px;
  }
  :host([compact]) .chip {
    min-height: 32px;
    padding: 4px 10px 4px 8px;
    font-size: 12px;
  }
  :host([compact]) .fold {
    margin-top: -12px;
  }
  :host([compact]) .fold.open {
    margin-top: 0;
  }
  :host([compact]) .big {
    font: 600 44px / 48px var(--m3e-font-brand);
  }
  :host([compact]) .step {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    --m3e-icon-size: 22px;
  }
  :host([compact]) m3e-slider {
    --m3e-slider-height: 40px;
  }
`;
