import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { isUnavailable } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-icon';
import '../components/m3e-shape';
import '../components/m3e-wavy-progress';

export interface MediaCardConfig extends BaseCardConfig {
  entity: string;
  /** Label above the title; default: the player's name. */
  device_name?: string;
  show_shuffle?: boolean;
  show_repeat?: boolean;
  /** Show the artwork faintly behind the whole card (default: true). */
  show_backdrop?: boolean;
}

// media_player supported_features bits
const F = { PAUSE: 1, SEEK: 2, PREVIOUS: 16, NEXT: 32, PLAY: 16384, SHUFFLE: 32768, REPEAT: 262144 };

const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Now-playing card: artwork, source, title, wavy progress, transport.
 *
 * Motion: the wavy progress travels while playing and flattens on pause; the
 * play button morphs between a rounded square (playing) and a full pill
 * (paused) and squashes wider while pressed; previous / next nudge in their
 * direction; the fallback artwork's sparkle spins slowly while playing.
 *
 * Seeking: when the player supports it, the progress bar is draggable. The
 * time label follows the drag, and `media_seek` is sent on release. The
 * dragged position is held until HA reports the new position (or 3s pass), so
 * the bar doesn't snap back in between.
 */
export class M3eMediaCard extends M3eBaseCard<MediaCardConfig> {
  @state() private now = Date.now();
  @state() private pressed = '';
  /** Position (s) being dragged to, or sent and not yet confirmed. */
  @state() private seek?: number;
  private seekSentAt?: string;
  private seekTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow: clip;
        isolation: isolate;
      }
      /* The artwork fills the whole card in place of the thumbnail, faded into
         the surface so the text stays readable. The scrim deepens toward the
         bottom, where the progress bar and transport sit. */
      .backdrop {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
      }
      .backdrop img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        filter: blur(var(--m3e-media-backdrop-blur, 0px));
        opacity: var(--m3e-media-backdrop-opacity, 0.55);
        transition: opacity var(--m3e-effects-default);
      }
      .backdrop::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--m3-surface-container) 10%, transparent) 0%,
          color-mix(in srgb, var(--m3-surface-container) 25%, transparent) 45%,
          color-mix(in srgb, var(--m3-surface-container) 70%, transparent) 100%
        );
      }
      .card:not(.playing) .backdrop img {
        opacity: calc(var(--m3e-media-backdrop-opacity, 0.55) * 0.6);
      }
      .has-backdrop .now {
        cursor: pointer;
      }
      .has-backdrop .artist {
        color: var(--m3-on-surface);
        opacity: 0.8;
      }
      /* The skip buttons sit on the artwork: let some of it through. */
      .has-backdrop .skip {
        background: color-mix(in srgb, var(--m3-surface-high) 72%, transparent);
      }
      .now {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .art {
        width: 80px;
        height: 80px;
        border-radius: 12px;
        flex: none;
        overflow: hidden;
        position: relative;
        background: linear-gradient(180deg, #3b3f5c 0%, #1e2030 100%);
        transition: border-radius var(--m3e-spatial-default);
      }
      .art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .playing .art {
        border-radius: 20px;
      }
      .art .orb {
        position: absolute;
        left: -20px;
        top: 52px;
        width: 120px;
        height: 60px;
        border-radius: 50%;
        background: rgb(17 17 27 / 0.6);
      }
      /* The design's moon (14px at 50,16). While playing it morphs into the
         4-point sparkle and turns slowly. */
      .art m3e-shape {
        position: absolute;
        left: 46px;
        top: 12px;
        --m3e-shape-color: #f9e2af;
        scale: 0.64;
        transition:
          transform var(--m3e-spatial-fast),
          scale var(--m3e-spatial-default);
      }
      .playing .art m3e-shape {
        scale: 1.1;
      }
      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .device {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--accent-fill);
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      .device m3e-icon {
        --m3e-icon-size: 16px;
      }
      .title {
        font: 600 22px / 28px var(--m3e-font-brand);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .artist {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .progress {
        display: flex;
        flex-direction: column;
        /* Clear of the handle: 24px at rest (4px below the track box), 32px
           pressed (8px below). */
        gap: 12px;
      }
      .times {
        display: flex;
        justify-content: space-between;
        font: 500 12px / 16px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .small {
        width: 44px;
        height: 44px;
        border-radius: 22px;
        color: var(--m3-on-surface-variant);
      }
      .small.on {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .small > * {
        grid-area: 1 / 1;
      }
      .small .badge {
        font: 600 11px / 1 var(--m3e-font-brand);
        margin-top: 1px;
      }
      .skip {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        --m3e-icon-size: 28px;
      }
      .skip.pressed {
        border-radius: 28px;
      }
      .skip.prev.pressed {
        transform: translateX(-4px) scale(0.94);
      }
      .skip.next.pressed {
        transform: translateX(4px) scale(0.94);
      }
      .play {
        width: 104px;
        height: 64px;
        border-radius: 32px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        --m3e-icon-size: 32px;
        transition:
          width var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }
      .playing .play {
        border-radius: 16px;
      }
      .play.pressed {
        width: 116px;
        border-radius: 24px;
      }
      .icon-btn:active {
        transform: none;
      }
      .icon-btn[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .idle .title {
        color: var(--m3-on-surface-variant);
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .now {
        gap: 12px;
      }
      :host([compact]) .art {
        width: 60px;
        height: 60px;
        border-radius: 10px;
      }
      :host([compact]) .playing .art {
        border-radius: 16px;
      }
      :host([compact]) .art .orb {
        left: -15px;
        top: 39px;
        width: 90px;
        height: 45px;
      }
      :host([compact]) .art m3e-shape {
        left: 34px;
        top: 8px;
      }
      :host([compact]) .title {
        font: 600 18px / 24px var(--m3e-font-brand);
      }
      :host([compact]) .artist {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .small {
        width: 40px;
        height: 40px;
      }
      :host([compact]) .skip {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        --m3e-icon-size: 24px;
      }
      :host([compact]) .skip.pressed {
        border-radius: 24px;
      }
      :host([compact]) .play {
        width: 88px;
        height: 52px;
        border-radius: 26px;
        --m3e-icon-size: 28px;
      }
      :host([compact]) .playing .play {
        border-radius: 14px;
      }
      :host([compact]) .play.pressed {
        width: 98px;
        border-radius: 20px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('media_player.')) ?? 'media_player.example';
    return { type: 'custom:m3e-media-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'media_player' } } },
        { name: 'device_name', selector: { text: {} } },
      ],
    };
  }

  protected normalizeConfig(config: MediaCardConfig): MediaCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  protected override defaultAccent(): Accent {
    return 'mauve';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 4;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => {
      if (this.stateObj(this.config?.entity)?.state === 'playing') this.now = Date.now();
    }, 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
    clearTimeout(this.seekTimer);
  }

  protected override shouldUpdate(changed: Map<PropertyKey, unknown>): boolean {
    return changed.has('now') || changed.has('pressed') || changed.has('seek') || super.shouldUpdate(changed as never);
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed as never);
    // HA confirmed a new position after our seek: let the live position take over.
    if (this.seekSentAt !== undefined && changed.has('hass')) {
      const updatedAt = this.stateObj(this.config.entity)?.attributes.media_position_updated_at;
      if (updatedAt !== this.seekSentAt) this.clearSeek();
    }
  }

  private clearSeek(): void {
    clearTimeout(this.seekTimer);
    this.seek = undefined;
    this.seekSentAt = undefined;
  }

  private onSeekInput(e: CustomEvent<{ value: number }>, duration: number): void {
    clearTimeout(this.seekTimer);
    this.seekSentAt = undefined;
    this.seek = e.detail.value * duration;
  }

  private onSeekChange(e: CustomEvent<{ value: number }>, duration: number): void {
    const s = this.stateObj(this.config.entity);
    const pos = Math.round(e.detail.value * duration * 10) / 10;
    this.seek = pos;
    this.seekSentAt = s?.attributes.media_position_updated_at ?? '';
    this.svc('media_seek', { seek_position: pos });
    clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => this.clearSeek(), 3000);
  }

  private position(s: HassEntity): number {
    if (this.seek !== undefined) return this.seek;
    const a = s.attributes;
    let pos = Number(a.media_position ?? 0);
    if (s.state === 'playing' && a.media_position_updated_at) {
      pos += (this.now - Date.parse(a.media_position_updated_at)) / 1000;
    }
    return Math.min(pos, Number(a.media_duration ?? pos));
  }

  private svc(service: string, data: Record<string, unknown> = {}): void {
    this.call('media_player', service, data, this.config.entity);
  }

  private pressHandlers(key: string) {
    return {
      down: () => (this.pressed = key),
      up: () => (this.pressed = ''),
    };
  }

  private btn(key: string, cls: string, icon: string, label: string, onClick: () => void, enabled = true, extra: unknown = nothing) {
    const h = this.pressHandlers(key);
    return html`<button
      class="icon-btn ${cls} ${this.pressed === key ? 'pressed' : ''}"
      aria-label=${label}
      ?disabled=${!enabled}
      @click=${onClick}
      @pointerdown=${h.down}
      @pointerup=${h.up}
      @pointerleave=${h.up}
      @pointercancel=${h.up}
    >
      <m3e-icon .icon=${icon}></m3e-icon>${extra}
    </button>`;
  }

  protected override render() {
    const s = this.stateObj(this.config.entity);
    if (!s) return html`<div class="card unavailable">エンティティが見つかりません: ${this.config.entity}</div>`;
    const a = s.attributes;
    const playing = s.state === 'playing';
    const active = playing || s.state === 'paused';
    const feat = Number(a.supported_features ?? 0);
    const duration = Number(a.media_duration ?? 0);
    const pos = this.position(s);
    const title = active ? (a.media_title ?? a.app_name ?? '再生中') : s.state === 'off' ? 'オフ' : '再生していません';
    const artist = active ? (a.media_artist ?? a.media_album_name ?? a.app_name ?? '') : '';
    const repeat = a.repeat as string | undefined;

    const backdrop = this.config.show_backdrop !== false && a.entity_picture;

    return html`<div class="card ${playing ? 'playing' : ''} ${active ? '' : 'idle'} ${backdrop ? 'has-backdrop' : ''} ${isUnavailable(s) ? 'unavailable' : ''}">
      ${backdrop ? html`<div class="backdrop" aria-hidden="true"><img src=${a.entity_picture} alt="" /></div>` : nothing}
      <div class="now" @click=${backdrop ? () => this.moreInfo(this.config.entity) : nothing}>
        ${backdrop
          ? nothing
          : html`<div class="art" @click=${() => this.moreInfo(this.config.entity)}>
              ${a.entity_picture
                ? html`<img src=${a.entity_picture} alt="" />`
                : html`<div class="orb"></div>
                    <m3e-shape .shape=${playing ? 'sparkle4' : 'circle'} size="22" ?spin=${playing}></m3e-shape>`}
            </div>`}
        <div class="text">
          <span class="device"><m3e-icon icon="speaker"></m3e-icon>${this.config.device_name ?? a.friendly_name}</span>
          <span class="title">${title}</span>
          <span class="artist">${artist}</span>
        </div>
      </div>

      <div class="progress">
        <m3e-wavy-progress
          .value=${duration ? pos / duration : 0}
          ?playing=${playing}
          ?seekable=${active && duration > 0 && !!(feat & F.SEEK)}
          .keyStep=${duration ? 5 / duration : 0.02}
          label="再生位置"
          .valueText=${`${fmtTime(pos)} / ${fmtTime(duration)}`}
          @input=${(e: CustomEvent<{ value: number }>) => this.onSeekInput(e, duration)}
          @change=${(e: CustomEvent<{ value: number }>) => this.onSeekChange(e, duration)}
        ></m3e-wavy-progress>
        <div class="times"><span>${fmtTime(pos)}</span><span>${fmtTime(duration)}</span></div>
      </div>

      <div class="controls">
        ${this.config.show_shuffle !== false
          ? this.btn('shuffle', `small ${a.shuffle ? 'on' : ''}`, 'shuffle', 'シャッフル', () => this.svc('shuffle_set', { shuffle: !a.shuffle }), !!(feat & F.SHUFFLE))
          : nothing}
        ${this.btn('prev', 'skip prev', 'skip-previous', '前へ', () => this.svc('media_previous_track'), !!(feat & F.PREVIOUS))}
        ${this.btn('play', 'play', playing ? 'pause' : 'play-arrow', playing ? '一時停止' : '再生', () => this.svc('media_play_pause'), !!(feat & (F.PAUSE | F.PLAY)))}
        ${this.btn('next', 'skip next', 'skip-next', '次へ', () => this.svc('media_next_track'), !!(feat & F.NEXT))}
        ${this.config.show_repeat !== false
          ? this.btn(
              'repeat',
              `small ${repeat && repeat !== 'off' ? 'on' : ''}`,
              'repeat',
              'リピート',
              () => this.svc('repeat_set', { repeat: repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off' }),
              !!(feat & F.REPEAT),
              repeat === 'one' ? html`<span class="badge">1</span>` : nothing,
            )
          : nothing}
      </div>
    </div>`;
  }
}

define('m3e-media-card', M3eMediaCard);
