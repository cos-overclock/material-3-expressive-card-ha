import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { hhmm, isActive, isUnavailable, relativeTime } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { SPRINGS, springTransition, prefersReducedMotion } from '../motion/spring';
import { define } from '../components/define';
import '../components/m3e-icon';

interface CameraEvent {
  /** binary_sensor (time it last turned on), event.*, or a timestamp sensor. */
  entity: string;
  name?: string;
  icon?: string;
  color?: Accent;
}

export interface CameraCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  /** full: large view with events and actions. compact: thumbnail with name and time. */
  layout?: 'full' | 'compact';
  /** Stream with HA's player when available (full layout). Default true. */
  live?: boolean;
  /** Seconds between still-image refreshes. Default 10 (full) / 30 (compact). */
  refresh?: number;
  /** Recent-event chips under the image. */
  events?: CameraEvent[];
  /** Minutes an event chip stays highlighted. Default 60. */
  recent_minutes?: number;
  /** compact: entity whose last change is shown as "1分前" (e.g. motion). */
  time_entity?: string;
  /** Snapshot button: saves on the server with camera.snapshot when set, else downloads the frame. */
  snapshot_filename?: string;
  /** Show the history button (opens the logbook for the camera and its events). Default true. */
  show_history?: boolean;
  /** switch / input_boolean for two-way audio: shows the microphone button. */
  talk_entity?: string;
  aspect_ratio?: string;
}

/** When an event entity last fired, as epoch ms. */
function eventTime(s: HassEntity | undefined): number | undefined {
  if (!s || isUnavailable(s)) return undefined;
  const fromState = Date.parse(s.state);
  if (s.entity_id.startsWith('event.') || s.attributes.device_class === 'timestamp') {
    return Number.isFinite(fromState) ? fromState : undefined;
  }
  const t = Date.parse(s.last_changed);
  return Number.isFinite(t) ? t : undefined;
}

const EVENT_ICON: Record<string, string> = {
  person: 'person',
  occupancy: 'person',
  motion: 'directions-walk',
  vehicle: 'directions-car',
  animal: 'pets',
  package: 'local-shipping',
  sound: 'volume-up',
};

function eventIcon(s: HassEntity | undefined, entity: string): string {
  const key = Object.keys(EVENT_ICON).find((k) => entity.includes(k) || s?.attributes.device_class === k);
  return key ? EVENT_ICON[key] : 'notifications-active';
}

/**
 * Camera: a large live view (LIVE badge, clock, name, fullscreen) with
 * recent-event chips and snapshot / history / talk buttons, or a compact
 * thumbnail with the time of the last motion.
 *
 * Motion: a new still cross-fades in on the default effects spring; taking a
 * snapshot flashes the view like a shutter and springs it down a little; the
 * snapshot button widens and rounds while pressed; a chip that just fired
 * re-tints and its icon pops.
 */
export class M3eCameraCard extends M3eBaseCard<CameraCardConfig> {
  @state() private src = '';
  @state() private prevSrc = '';
  @state() private now = Date.now();
  @state() private pressed = '';
  @state() private failed = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private clockTimer?: ReturnType<typeof setInterval>;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .card.full {
        padding-bottom: 16px;
      }
      .view {
        position: relative;
        border-radius: 24px;
        overflow: hidden;
        background: #11111b;
        aspect-ratio: var(--ratio, 16 / 9);
        isolation: isolate;
      }
      .view img,
      .view ha-camera-stream {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        --video-max-height: 100%;
      }
      .view img.prev {
        z-index: 0;
      }
      .view img.cur,
      .view ha-camera-stream {
        z-index: 1;
      }
      .view::after {
        /* legibility for the overlays */
        content: '';
        position: absolute;
        inset: 0;
        z-index: 2;
        background:
          linear-gradient(180deg, rgba(0, 0, 0, 0.28) 0%, transparent 26%),
          linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0%, transparent 38%);
        pointer-events: none;
      }
      .overlay {
        position: absolute;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #fff;
      }
      .pill {
        height: 28px;
        padding: 0 12px;
        border-radius: 14px;
        background: rgba(17, 17, 27, 0.72);
        font: 600 13px / 1 var(--m3e-font-brand);
        letter-spacing: 0.5px;
        font-variant-numeric: tabular-nums;
      }
      .live {
        top: 12px;
        left: 12px;
      }
      .live i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f38ba8;
      }
      .clock {
        top: 12px;
        right: 12px;
        font-weight: 500;
      }
      .title {
        left: 16px;
        bottom: 14px;
        font: 600 16px / 22px var(--m3e-font-plain);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      }
      .fs {
        right: 12px;
        bottom: 10px;
        width: 40px;
        height: 40px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.18);
        color: #fff;
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        z-index: 3;
        position: absolute;
      }
      .fs:active {
        border-radius: 12px;
      }
      .flash {
        position: absolute;
        inset: 0;
        z-index: 4;
        background: #fff;
        opacity: 0;
        pointer-events: none;
      }
      .empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface-variant);
        font: 400 13px / 18px var(--m3e-font-plain);
      }
      .empty m3e-icon {
        --m3e-icon-size: 32px;
      }
      .events {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 4px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px 0 10px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 400 13px / 1 var(--m3e-font-plain);
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .chip m3e-icon {
        --m3e-icon-size: 18px;
        color: var(--m3-on-surface-variant);
      }
      .chip.recent {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .chip.recent m3e-icon {
        color: inherit;
      }
      .actions {
        display: flex;
        gap: 8px;
        padding: 0 4px;
        height: 48px;
      }
      .snap {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 24px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        font: 500 15px / 1 var(--m3e-font-plain);
        transition:
          flex-grow var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }
      .snap m3e-icon {
        --m3e-icon-size: 20px;
      }
      .side {
        flex: 0 0 48px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        transition:
          flex-basis var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .side.on {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        border-radius: 24px;
      }
      .snap.pressed {
        border-radius: 16px;
      }
      .side.pressed {
        flex-basis: 60px;
        border-radius: 24px;
      }
      .actions .icon-btn:active {
        transform: none;
      }

      /* compact */
      .card.compact {
        gap: 8px;
        padding-bottom: 12px;
        cursor: pointer;
      }
      .compact .view {
        aspect-ratio: var(--ratio, 16 / 10);
        border-radius: 16px;
      }
      .compact .view::after {
        display: none;
      }
      .meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 0 8px;
      }
      .meta .name {
        font: 500 15px / 22px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta .ago {
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card.full {
        padding: 6px 6px 12px;
        gap: 10px;
      }
      :host([compact]) .full .view {
        border-radius: 20px;
      }
      :host([compact]) .pill {
        height: 24px;
        padding: 0 10px;
        font-size: 12px;
      }
      :host([compact]) .title {
        font: 600 15px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .fs {
        width: 36px;
        height: 36px;
      }
      :host([compact]) .events {
        gap: 6px;
        flex-wrap: wrap;
      }
      :host([compact]) .chip {
        height: 28px;
        font-size: 12px;
      }
      :host([compact]) .actions {
        height: 40px;
        gap: 6px;
      }
      :host([compact]) .snap {
        border-radius: 20px;
        font: 500 14px / 1 var(--m3e-font-plain);
      }
      :host([compact]) .side {
        flex-basis: 40px;
        border-radius: 14px;
      }
      :host([compact]) .side.on,
      :host([compact]) .side.pressed {
        border-radius: 20px;
      }
      :host([compact]) .snap.pressed {
        border-radius: 14px;
      }
      :host([compact]) .card.compact {
        gap: 6px;
        padding: 6px 6px 10px;
      }
      :host([compact]) .meta .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('camera.')) ?? 'camera.example';
    return { type: 'custom:m3e-camera-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'camera' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'layout', selector: { select: { options: ['full', 'compact'] } } },
        { name: 'live', default: true, selector: { boolean: {} } },
        { name: 'events', selector: { object: {} } },
        { name: 'talk_entity', selector: { entity: { domain: ['switch', 'input_boolean'] } } },
        { name: 'time_entity', selector: { entity: {} } },
      ],
    };
  }

  protected normalizeConfig(config: CameraCardConfig): CameraCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity, this.config.talk_entity, this.config.time_entity, ...(this.config.events ?? []).map((e) => e.entity)].filter(
      Boolean,
    ) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'mauve';
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.config.layout === 'compact'
      ? { columns: 6, rows: 'auto', min_columns: 4 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.config.layout === 'compact' ? 3 : 6;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const compact = this.config?.layout === 'compact';
    const every = (this.config?.refresh ?? (compact ? 30 : 10)) * 1000;
    this.refreshTimer = setInterval(() => this.loadStill(), every);
    this.clockTimer = setInterval(() => (this.now = Date.now()), compact ? 30_000 : 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.refreshTimer);
    clearInterval(this.clockTimer);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.src && this.hass) this.loadStill();
  }

  private streaming(): boolean {
    return this.config.layout !== 'compact' && this.config.live !== false && !!customElements.get('ha-camera-stream');
  }

  private pictureUrl(): string | undefined {
    const s = this.stateObj(this.config.entity);
    const pic = s?.attributes.entity_picture as string | undefined;
    if (!pic) return undefined;
    // camera_proxy URLs carry a token; add a cache-buster so every refresh is a new frame.
    return pic.startsWith('data:') ? pic : `${pic}${pic.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }

  /** Preload the next frame, then swap it in so the old one can fade out. */
  private loadStill(): void {
    if (this.streaming()) return;
    const url = this.pictureUrl();
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      this.failed = false;
      if (url === this.src) return;
      this.prevSrc = this.src;
      this.src = url;
    };
    img.onerror = () => (this.failed = !this.src);
    img.src = url;
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if ((changed as Map<string, unknown>).has('src') && this.prevSrc) {
      const cur = this.renderRoot.querySelector('img.cur');
      if (cur && !prefersReducedMotion()) {
        const t = springTransition(SPRINGS.effectsDefault);
        cur.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(t.duration, 300), easing: t.easing });
      }
    }
  }

  private async snapshot(): Promise<void> {
    const view = this.renderRoot.querySelector('.view') as HTMLElement | null;
    const flash = this.renderRoot.querySelector('.flash') as HTMLElement | null;
    if (!prefersReducedMotion()) {
      const t = springTransition(SPRINGS.spatialFast);
      flash?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
      view?.animate([{ transform: 'scale(0.96)' }, { transform: 'none' }], { duration: t.duration, easing: t.easing });
    }
    if (this.config.snapshot_filename) {
      this.call('camera', 'snapshot', { filename: this.config.snapshot_filename }, this.config.entity);
      return;
    }
    const url = this.src || this.pictureUrl();
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${hhmm(d).replace(':', '')}`;
      a.href = URL.createObjectURL(blob);
      a.download = `${this.config.entity.replace('camera.', '')}-${stamp}.${blob.type.includes('png') ? 'png' : 'jpg'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      console.warn('m3e-camera-card: snapshot failed', e);
    }
  }

  private openHistory(): void {
    const ids = [this.config.entity, ...(this.config.events ?? []).map((e) => e.entity)].join(',');
    history.pushState(null, '', `/logbook?entity_id=${encodeURIComponent(ids)}`);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }

  private fullscreen(): void {
    const view = this.renderRoot.querySelector('.view') as HTMLElement | null;
    if (document.fullscreenElement) document.exitFullscreen();
    else view?.requestFullscreen?.();
  }

  private pressHandlers(key: string) {
    return {
      down: () => (this.pressed = key),
      up: () => (this.pressed = ''),
    };
  }

  private renderView(s: HassEntity | undefined, name: string, full: boolean) {
    const off = isUnavailable(s);
    const stream = this.streaming() && !off;
    const ratio = this.config.aspect_ratio?.replace(':', ' / ');
    return html`<div class="view" style=${ratio ? `--ratio:${ratio}` : ''}>
      ${off || (this.failed && !stream)
        ? html`<div class="empty"><m3e-icon icon="videocam"></m3e-icon>${off ? '利用できません' : '画像を取得できません'}</div>`
        : stream
          ? html`<ha-camera-stream .hass=${this.hass} .stateObj=${s} muted playsinline allow-exoplayer></ha-camera-stream>`
          : html`${this.prevSrc ? html`<img class="prev" src=${this.prevSrc} alt="" />` : nothing}
            ${this.src ? html`<img class="cur" src=${this.src} alt=${name} />` : nothing}`}
      ${full
        ? html`${stream || s?.state === 'streaming' || s?.state === 'recording'
              ? html`<span class="overlay pill live"><i></i>LIVE</span>`
              : nothing}
            <span class="overlay pill clock">${this.clock()}</span>
            <span class="overlay title">${name}</span>
            <button class="icon-btn fs" aria-label="全画面表示" @click=${this.fullscreen}><m3e-icon icon="fullscreen"></m3e-icon></button>
            <div class="flash"></div>`
        : nothing}
    </div>`;
  }

  private clock(): string {
    const d = new Date(this.now);
    return `${hhmm(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  private renderEvents() {
    const events = this.config.events ?? [];
    if (!events.length) return nothing;
    const recent = (this.config.recent_minutes ?? 60) * 60_000;
    return html`<div class="events">
      ${repeat(
        events,
        (e) => e.entity,
        (e) => {
          const s = this.stateObj(e.entity);
          const t = eventTime(s);
          const active = isActive(s) && !e.entity.startsWith('event.');
          const isRecent = active || (t !== undefined && this.now - t < recent);
          const name = e.name ?? (s?.attributes.friendly_name as string) ?? e.entity;
          return html`<span
            class="chip ${isRecent ? 'recent' : ''}"
            data-accent=${e.color ?? this.config.color ?? 'mauve'}
            role="button"
            @click=${() => this.moreInfo(e.entity)}
          >
            <m3e-icon .icon=${e.icon ?? eventIcon(s, e.entity)}></m3e-icon>${name}${active ? '中' : t !== undefined ? ` ${hhmm(t)}` : ''}
          </span>`;
        },
      )}
    </div>`;
  }

  private renderFull(s: HassEntity | undefined, name: string) {
    const talk = this.stateObj(this.config.talk_entity);
    const snap = this.pressHandlers('snap');
    const hist = this.pressHandlers('hist');
    const mic = this.pressHandlers('mic');
    return html`<div class="card full">
      ${this.renderView(s, name, true)} ${this.renderEvents()}
      <div class="actions">
        <button
          class="icon-btn snap ${this.pressed === 'snap' ? 'pressed' : ''}"
          ?disabled=${isUnavailable(s)}
          @click=${this.snapshot}
          @pointerdown=${snap.down}
          @pointerup=${snap.up}
          @pointerleave=${snap.up}
        >
          <m3e-icon icon="photo-camera"></m3e-icon>スナップショット
        </button>
        ${this.config.show_history === false
          ? nothing
          : html`<button
              class="icon-btn side ${this.pressed === 'hist' ? 'pressed' : ''}"
              aria-label="履歴"
              @click=${this.openHistory}
              @pointerdown=${hist.down}
              @pointerup=${hist.up}
              @pointerleave=${hist.up}
            >
              <m3e-icon icon="history"></m3e-icon>
            </button>`}
        ${this.config.talk_entity
          ? html`<button
              class="icon-btn side ${isActive(talk) ? 'on' : ''} ${this.pressed === 'mic' ? 'pressed' : ''}"
              aria-label="通話"
              aria-pressed=${isActive(talk) ? 'true' : 'false'}
              ?disabled=${isUnavailable(talk)}
              @click=${() => talk && this.hass && this.call('homeassistant', isActive(talk) ? 'turn_off' : 'turn_on', {}, talk.entity_id)}
              @pointerdown=${mic.down}
              @pointerup=${mic.up}
              @pointerleave=${mic.up}
            >
              <m3e-icon icon="mic"></m3e-icon>
            </button>`
          : nothing}
      </div>
    </div>`;
  }

  private renderCompact(s: HassEntity | undefined, name: string) {
    const ts = this.stateObj(this.config.time_entity);
    const t = eventTime(ts);
    const when = t !== undefined ? relativeTime(new Date(t).toISOString(), this.now) : '';
    return html`<div class="card compact" role="button" tabindex="0" @click=${() => this.moreInfo(this.config.entity)}>
      ${this.renderView(s, name, false)}
      <div class="meta">
        <span class="name">${name}</span>
        ${when ? html`<span class="ago">${when}</span>` : nothing}
      </div>
    </div>`;
  }

  protected override render() {
    const s = this.stateObj(this.config.entity);
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    return this.config.layout === 'compact' ? this.renderCompact(s, name) : this.renderFull(s, name);
  }
}

define('m3e-camera-card', M3eCameraCard);
