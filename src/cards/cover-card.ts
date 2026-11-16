import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { areaName, isUnavailable } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-slider';
import '../components/m3e-rolling-text';

export interface CoverCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  icon?: string;
  /**
   * full (default): window illustration, position slider, open / stop / close.
   * compact: one row (icon, name, state, ▲ ■ ▼) for listing several covers.
   */
  layout?: 'full' | 'compact';
  /** compact: text before the state, e.g. "寝室". Default: the entity's area. */
  secondary?: string;
  /** full: hide the window illustration. Default: shown. */
  show_illustration?: boolean;
  /** Sky in the illustration: auto follows sun.sun. */
  sky?: 'auto' | 'day' | 'night';
}

// CoverEntityFeature
const OPEN = 1;
const CLOSE = 2;
const SET_POSITION = 4;
const STOP = 8;

const supports = (s: HassEntity | undefined, f: number) => ((s?.attributes.supported_features ?? 0) & f) !== 0;

/** 0..100, open = 100. Falls back to the open / closed state. */
function position(s: HassEntity | undefined): number {
  const p = s?.attributes.current_position;
  if (typeof p === 'number') return p;
  return s?.state === 'open' || s?.state === 'opening' ? 100 : 0;
}

function stateLabel(s: HassEntity | undefined): string {
  if (!s) return '見つかりません';
  switch (s.state) {
    case 'opening':
      return '開けています';
    case 'closing':
      return '閉めています';
    case 'open':
      return position(s) >= 100 ? '全開' : '開いています';
    case 'closed':
      return '閉まっています';
    case 'unavailable':
      return '利用不可';
    default:
      return '不明';
  }
}

function coverIcon(s: HassEntity | undefined, open: boolean): string {
  switch (s?.attributes.device_class) {
    case 'blind':
    case 'shutter':
      return 'blinds';
    case 'shade':
      return open ? 'roller-shades' : 'roller-shades-closed';
    case 'garage':
      return 'garage-door';
    default:
      return open ? 'curtains' : 'curtains-closed';
  }
}

/** How the illustration draws a device class. */
const kindOf = (s: HassEntity | undefined): 'curtain' | 'shade' | 'blind' => {
  const dc = s?.attributes.device_class;
  if (dc === 'blind' || dc === 'shutter') return 'blind';
  if (dc === 'shade' || dc === 'awning' || dc === 'garage' || dc === 'gate' || dc === 'door') return 'shade';
  return 'curtain';
};

/**
 * One curtain or shade.
 *
 *  full     window illustration, position slider, open / stop / close.
 *  compact  a single row (1 grid row): icon, name, area・state and ▲ ■ ▼,
 *           so several covers stack as a list under a heading.
 *
 * Motion: the curtains (or the shade) follow the position on the default
 * spatial spring, so a cover reported as moving glides between updates and
 * dragging the slider moves them live; the percentage rolls; the header
 * shape morphs circle ⇄ cookie as the cover closes / opens.
 */
export class M3eCoverCard extends M3eBaseCard<CoverCardConfig> {
  /** Position under the finger while dragging the slider. */
  @state() private dragPos?: number;
  /** Position just requested, shown until HA reports it. */
  @state() private pendingPos?: number;
  private pendingTimer?: ReturnType<typeof setTimeout>;

  static override styles = [
    M3eBaseCard.styles,
    css`
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
        cursor: pointer;
      }
      .header m3e-shape,
      .row m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
      }
      [data-accent='neutral'] .header m3e-shape,
      [data-accent='neutral'].row m3e-shape {
        --m3e-shape-color: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .text {
        flex: 1;
        min-width: 0;
      }
      .name {
        font: 500 16px / 24px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .pct {
        font: 600 28px / 36px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.5px;
      }

      /* ── window illustration ── */
      .window {
        position: relative;
        height: 104px;
        border-radius: 20px;
        overflow: hidden;
        background: linear-gradient(180deg, #262b4b 0%, #4a4570 55%, #7b5a80 100%);
        transition: background-color var(--m3e-effects-slow);
      }
      .window.day {
        background: linear-gradient(180deg, #7fb2ef 0%, #a9cdf3 60%, #d9e8f6 100%);
      }
      .mullion {
        position: absolute;
        left: calc(50% - 2px);
        top: 0;
        bottom: 0;
        width: 4px;
        background: rgba(17, 17, 27, 0.35);
      }
      .orb {
        position: absolute;
        left: 66%;
        top: 22%;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #f3ead2;
        box-shadow: 0 0 12px rgba(243, 234, 210, 0.35);
      }
      .day .orb {
        width: 20px;
        height: 20px;
        background: #fff3c4;
        box-shadow: 0 0 18px 4px rgba(255, 236, 160, 0.7);
      }
      .panel {
        position: absolute;
        top: 0;
        bottom: 0;
        background-color: var(--accent-fill);
        /* pleats: three folds that widen as the curtain is drawn */
        background-image: linear-gradient(
          90deg,
          transparent 0 calc(33% - 1px),
          rgba(17, 17, 27, 0.16) calc(33% - 1px) calc(33% + 1px),
          transparent calc(33% + 1px) calc(66% - 1px),
          rgba(17, 17, 27, 0.16) calc(66% - 1px) calc(66% + 1px),
          transparent calc(66% + 1px)
        );
        transition:
          width var(--m3e-spatial-default),
          height var(--m3e-spatial-default),
          background-color var(--m3e-effects-default);
      }
      .panel.left {
        left: 0;
        width: var(--cover);
        border-radius: 0 12px 12px 0;
      }
      .panel.right {
        right: 0;
        width: var(--cover);
        border-radius: 12px 0 0 12px;
      }
      .panel.top {
        left: 0;
        right: 0;
        height: var(--cover);
        border-radius: 0 0 12px 12px;
        background-image: none;
      }
      .panel.top.slats {
        background-image: repeating-linear-gradient(
          180deg,
          transparent 0 8px,
          rgba(17, 17, 27, 0.18) 8px 10px
        );
      }
      .window.dragging .panel {
        transition:
          width var(--m3e-spatial-fast),
          height var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }

      m3e-slider {
        --m3e-slider-active: var(--accent-fill);
        --m3e-slider-inactive: var(--m3-surface-highest);
        --m3e-slider-handle: var(--m3-on-surface);
      }

      /* ── open / stop / close ── */
      .actions {
        display: flex;
        gap: 4px;
        height: 52px;
      }
      .act {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 0;
        min-width: 0;
        gap: 8px;
        border-radius: 8px;
        font: 500 15px / 1 var(--m3e-font-plain);
        background: var(--accent-container);
        color: var(--accent-on-container);
        transition:
          flex-grow var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          transform var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .act.open {
        border-radius: 26px 8px 8px 26px;
      }
      .act.close {
        border-radius: 8px 26px 26px 8px;
      }
      .act.stop {
        flex: 0 0 64px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .act:active {
        flex-grow: 1.3;
        border-radius: 26px;
        transform: none;
      }
      .act.stop:active {
        flex-basis: 76px;
      }
      .act[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .act m3e-icon {
        --m3e-icon-size: 20px;
      }

      /* ── compact layout: the whole card is one row ── */
      /* Fill the grid row HA gives the card (56px) in either density; full stays auto-height. */
      :host {
        height: 100%;
      }
      .card.row {
        height: 100%;
        flex-direction: row;
        align-items: center;
        gap: 14px;
        padding: 8px 8px 8px 12px;
      }
      .row m3e-shape {
        cursor: pointer;
      }
      .row .text {
        cursor: pointer;
      }
      .row .name {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      .row .state {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mini {
        display: flex;
        gap: 2px;
      }
      .mini .icon-btn {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .mini .icon-btn:first-child {
        border-radius: 20px 8px 8px 20px;
      }
      .mini .icon-btn:last-child {
        border-radius: 8px 20px 20px 8px;
      }
      .mini .icon-btn:active {
        border-radius: 20px;
      }
      .mini .icon-btn[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .mini .stop-glyph,
      .act .stop-glyph {
        width: 12px;
        height: 12px;
        border-radius: 2px;
        background: currentColor;
      }
      .act .stop-glyph {
        width: 16px;
        height: 16px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) {
        --m3e-slider-height: 36px;
      }
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .header {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .state {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .pct {
        font: 600 22px / 28px var(--m3e-font-brand);
      }
      :host([compact]) .window {
        height: 64px;
        border-radius: 16px;
      }
      :host([compact]) .actions {
        height: 44px;
      }
      :host([compact]) .act {
        font: 500 14px / 1 var(--m3e-font-plain);
      }
      :host([compact]) .act.open {
        border-radius: 22px 8px 8px 22px;
      }
      :host([compact]) .act.close {
        border-radius: 8px 22px 22px 8px;
      }
      :host([compact]) .act:active {
        border-radius: 22px;
      }
      :host([compact]) .card.row {
        padding: 6px 8px 6px 10px;
        gap: 10px;
      }
      :host([compact]) .row .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .mini .icon-btn {
        width: 36px;
        height: 36px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const covers = Object.keys(hass.states).filter((id) => id.startsWith('cover.'));
    return { type: 'custom:m3e-cover-card', entity: covers[0] ?? 'cover.example' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'cover' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'layout', selector: { select: { options: ['full', 'compact'] } } },
        { name: 'show_illustration', default: true, selector: { boolean: {} } },
      ],
    };
  }

  protected normalizeConfig(config: CoverCardConfig): CoverCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (config.layout && !['full', 'compact'].includes(config.layout)) throw new Error('layout must be full or compact');
    if ((config as { entities?: unknown }).entities) {
      throw new Error('entities is no longer supported: add one m3e-cover-card with layout: compact per cover');
    }
    return config;
  }

  private get isRow(): boolean {
    return this.config.layout === 'compact';
  }

  protected watchedEntities(): string[] {
    return this.isRow ? [this.config.entity] : [this.config.entity, 'sun.sun'];
  }

  protected override defaultAccent(): Accent {
    return 'lavender';
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.isRow ? { columns: 12, rows: 1, min_columns: 6 } : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.isRow ? 1 : 6;
  }

  private shownPosition(s: HassEntity | undefined): number {
    return this.dragPos ?? this.pendingPos ?? position(s);
  }

  private setPosition(pos: number): void {
    this.pendingPos = pos;
    clearTimeout(this.pendingTimer);
    // Covers take a while: keep the requested position until HA catches up.
    this.pendingTimer = setTimeout(() => (this.pendingPos = undefined), 4000);
    this.call('cover', 'set_cover_position', { position: pos }, this.config.entity);
  }

  private command(entity: string, service: 'open_cover' | 'close_cover' | 'stop_cover'): void {
    if (entity === this.config.entity) {
      clearTimeout(this.pendingTimer);
      this.pendingPos = undefined;
    }
    this.call('cover', service, {}, entity);
  }

  protected override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    // Drop the optimistic position once HA reports it (or stops moving).
    const s = this.stateObj(this.config.entity);
    if (this.pendingPos !== undefined && s && position(s) === this.pendingPos) this.pendingPos = undefined;
  }

  private isDay(): boolean {
    if (this.config.sky === 'day') return true;
    if (this.config.sky === 'night') return false;
    const sun = this.stateObj('sun.sun');
    if (sun) return sun.state === 'above_horizon';
    const h = new Date().getHours();
    return h >= 6 && h < 18;
  }

  private renderWindow(s: HassEntity | undefined, pos: number) {
    const kind = kindOf(s);
    const closed = 1 - pos / 100;
    // Curtains meet in the middle: each panel covers half the window when closed.
    const cover = kind === 'curtain' ? `${closed * 50}%` : `${closed * 100}%`;
    return html`<div
      data-accent=${this.config.color ?? 'lavender'}
      class="window ${this.isDay() ? 'day' : ''} ${this.dragPos !== undefined ? 'dragging' : ''}"
      style="--cover:${cover}"
      aria-hidden="true"
    >
      <div class="orb"></div>
      <div class="mullion"></div>
      ${kind === 'curtain'
        ? html`<div class="panel left"></div>
            <div class="panel right"></div>`
        : html`<div class="panel top ${kind === 'blind' ? 'slats' : ''}"></div>`}
    </div>`;
  }

  private renderCompact() {
    const entity = this.config.entity;
    const s = this.stateObj(entity);
    const off = isUnavailable(s);
    const open = position(s) > 0 || s?.state === 'open';
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? entity;
    const area = this.config.secondary ?? areaName(this.hass, entity);
    const pos = s?.attributes.current_position;
    const st =
      off || s!.state === 'opening' || s!.state === 'closing'
        ? stateLabel(s)
        : `${open ? '開' : '閉'}${typeof pos === 'number' ? ` ${pos}%` : ''}`;
    const can = (f: number) => !off && (s!.attributes.supported_features === undefined || supports(s, f));
    return html`<div class="card row ${off ? 'unavailable' : ''}" data-accent=${open ? nothing : 'neutral'}>
      <m3e-shape .shape=${open ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 40} @click=${() => this.moreInfo(entity)}>
        <m3e-icon .icon=${this.config.icon ?? coverIcon(s, open)}></m3e-icon>
      </m3e-shape>
      <div class="text" @click=${() => this.moreInfo(entity)}>
        <p class="name">${name}</p>
        <p class="state">${area ? `${area}・` : ''}${st}</p>
      </div>
      <div class="mini">
        <button class="icon-btn" aria-label="${name}を開ける" ?disabled=${!can(OPEN)} @click=${() => this.command(entity, 'open_cover')}>
          <m3e-icon icon="keyboard-arrow-up"></m3e-icon>
        </button>
        <button class="icon-btn" aria-label="${name}を止める" ?disabled=${!can(STOP)} @click=${() => this.command(entity, 'stop_cover')}>
          <span class="stop-glyph"></span>
        </button>
        <button class="icon-btn" aria-label="${name}を閉める" ?disabled=${!can(CLOSE)} @click=${() => this.command(entity, 'close_cover')}>
          <m3e-icon icon="keyboard-arrow-down"></m3e-icon>
        </button>
      </div>
    </div>`;
  }

  protected override render() {
    if (this.isRow) return this.renderCompact();
    const s = this.stateObj(this.config.entity);
    const off = isUnavailable(s);
    const pos = this.shownPosition(s);
    const open = pos > 0;
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    const hasPosition = typeof s?.attributes.current_position === 'number';
    // Without supported_features (e.g. a template cover), offer everything.
    const can = (f: number) => !off && (s!.attributes.supported_features === undefined || supports(s, f));
    return html`<div class="card ${off ? 'unavailable' : ''}" data-accent=${open ? nothing : 'neutral'}>
      <div class="header" @click=${() => this.moreInfo(this.config.entity)}>
        <m3e-shape .shape=${open ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44}>
          <m3e-icon .icon=${this.config.icon ?? coverIcon(s, open)}></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="name">${name}</p>
          <p class="state">${this.dragPos !== undefined ? '位置を調整中' : stateLabel(s)}</p>
        </div>
        ${hasPosition || this.dragPos !== undefined
          ? html`<span class="pct"><m3e-rolling-text .text=${`${Math.round(pos)}%`}></m3e-rolling-text></span>`
          : nothing}
      </div>
      ${this.config.show_illustration === false ? nothing : this.renderWindow(s, pos)}
      ${hasPosition && can(SET_POSITION)
        ? html`<m3e-slider
            data-accent=${this.config.color ?? 'lavender'}
            .value=${pos}
            min="0"
            max="100"
            label="${name}の開き具合"
            @input=${(e: CustomEvent) => (this.dragPos = e.detail.value)}
            @change=${(e: CustomEvent) => {
              this.dragPos = undefined;
              this.setPosition(e.detail.value);
            }}
          ></m3e-slider>`
        : nothing}
      <div class="actions" data-accent=${this.config.color ?? 'lavender'}>
        <button class="icon-btn act open" ?disabled=${!can(OPEN)} @click=${() => this.command(this.config.entity, 'open_cover')}>
          <m3e-icon .icon=${coverIcon(s, true)}></m3e-icon>開ける
        </button>
        <button class="icon-btn act stop" aria-label="止める" ?disabled=${!can(STOP)} @click=${() => this.command(this.config.entity, 'stop_cover')}>
          <span class="stop-glyph"></span>
        </button>
        <button class="icon-btn act close" ?disabled=${!can(CLOSE)} @click=${() => this.command(this.config.entity, 'close_cover')}>
          <m3e-icon .icon=${coverIcon(s, false)}></m3e-icon>閉める
        </button>
      </div>
    </div>`;
  }
}

define('m3e-cover-card', M3eCoverCard);
