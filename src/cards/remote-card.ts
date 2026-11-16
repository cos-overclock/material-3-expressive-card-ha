import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { richCardStyles } from './shared-styles';
import { domainOf, fireHaptic, isUnavailable } from '../ha/helpers';
import type { ActionConfig, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';

type Key =
  | 'power'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'home'
  | 'menu'
  | 'volume_up'
  | 'volume_down'
  | 'mute'
  | 'channel_up'
  | 'channel_down'
  | 'play_pause'
  | 'rewind'
  | 'fast_forward';

type Preset = 'generic' | 'android_tv' | 'apple_tv' | 'roku' | 'samsung' | 'lg';

export interface RemoteCardConfig extends BaseCardConfig {
  /** The TV as a media_player: state, volume, sources, play / pause. */
  entity?: string;
  /** remote.* for the arrow keys and the rest (remote.send_command). */
  remote_entity?: string;
  name?: string;
  icon?: string;
  /** Command names the remote integration expects. Default generic (up, down, select…). */
  preset?: Preset;
  /** Override command names per key: { ok: DPAD_CENTER } */
  commands?: Partial<Record<Key, string>>;
  /** Run an action instead of a command for a key: { home: { action: perform-action, perform_action: script.tv_home } } */
  key_actions?: Partial<Record<Key, ActionConfig>>;
  /** Volume and channel rows, transport row, source chips. Default true each. */
  show_volume?: boolean;
  show_channels?: boolean;
  show_transport?: boolean;
  show_sources?: boolean;
}

const BASE: Record<Key, string> = {
  power: 'power',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  ok: 'select',
  back: 'back',
  home: 'home',
  menu: 'menu',
  volume_up: 'volume_up',
  volume_down: 'volume_down',
  mute: 'mute',
  channel_up: 'channel_up',
  channel_down: 'channel_down',
  play_pause: 'play_pause',
  rewind: 'rewind',
  fast_forward: 'fast_forward',
};

/** Command names of the common remote integrations. */
const PRESETS: Record<Preset, Partial<Record<Key, string>>> = {
  generic: {},
  android_tv: {
    power: 'POWER',
    up: 'DPAD_UP',
    down: 'DPAD_DOWN',
    left: 'DPAD_LEFT',
    right: 'DPAD_RIGHT',
    ok: 'DPAD_CENTER',
    back: 'BACK',
    home: 'HOME',
    menu: 'MENU',
    volume_up: 'VOLUME_UP',
    volume_down: 'VOLUME_DOWN',
    mute: 'MUTE',
    channel_up: 'CHANNEL_UP',
    channel_down: 'CHANNEL_DOWN',
    play_pause: 'MEDIA_PLAY_PAUSE',
    rewind: 'MEDIA_REWIND',
    fast_forward: 'MEDIA_FAST_FORWARD',
  },
  apple_tv: { ok: 'select', back: 'menu', home: 'home', menu: 'top_menu', play_pause: 'play_pause', rewind: 'skip_backward', fast_forward: 'skip_forward' },
  roku: { ok: 'select', back: 'back', home: 'home', menu: 'info', play_pause: 'play', rewind: 'reverse', fast_forward: 'forward' },
  samsung: {
    power: 'KEY_POWER',
    up: 'KEY_UP',
    down: 'KEY_DOWN',
    left: 'KEY_LEFT',
    right: 'KEY_RIGHT',
    ok: 'KEY_ENTER',
    back: 'KEY_RETURN',
    home: 'KEY_HOME',
    menu: 'KEY_MENU',
    volume_up: 'KEY_VOLUP',
    volume_down: 'KEY_VOLDOWN',
    mute: 'KEY_MUTE',
    channel_up: 'KEY_CHUP',
    channel_down: 'KEY_CHDOWN',
    play_pause: 'KEY_PLAY',
    rewind: 'KEY_REWIND',
    fast_forward: 'KEY_FF',
  },
  lg: {
    up: 'UP',
    down: 'DOWN',
    left: 'LEFT',
    right: 'RIGHT',
    ok: 'ENTER',
    back: 'BACK',
    home: 'HOME',
    menu: 'MENU',
    volume_up: 'VOLUMEUP',
    volume_down: 'VOLUMEDOWN',
    mute: 'MUTE',
    channel_up: 'CHANNELUP',
    channel_down: 'CHANNELDOWN',
    play_pause: 'PLAY',
    rewind: 'REWIND',
    fast_forward: 'FASTFORWARD',
  },
};

// media_player features
const MP = { PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, TURN_ON: 128, TURN_OFF: 256, VOLUME_STEP: 1024, SELECT_SOURCE: 2048, PLAY: 16384 };

/**
 * TV remote: power, a round D-pad with OK, back / home / menu, volume and
 * channel rockers, play / pause and the inputs. Keys go to remote.send_command
 * (names from `preset` or `commands`); volume, mute, play / pause and inputs
 * use the media_player when one is set.
 *
 * Motion: keys round and shrink while pressed; the D-pad's pressed arrow
 * lights up; the source chips re-tint when the input changes.
 */
export class M3eRemoteCard extends M3eBaseCard<RemoteCardConfig> {
  @state() private pressedKey = '';

  static override styles = [
    M3eBaseCard.styles,
    richCardStyles,
    css`
      .pad {
        position: relative;
        width: min(100%, 232px);
        aspect-ratio: 1;
        margin: 0 auto;
        border-radius: 50%;
        background: var(--m3-surface-high);
        display: grid;
        grid-template: 1fr 1.1fr 1fr / 1fr 1.1fr 1fr;
      }
      .pad .arrow {
        display: grid;
        place-items: center;
        color: var(--m3-on-surface-variant);
        border-radius: 50%;
        --m3e-icon-size: 32px;
      }
      .pad .arrow.on {
        color: var(--accent-fill);
      }
      .arrow.up {
        grid-area: 1 / 2;
      }
      .arrow.left {
        grid-area: 2 / 1;
      }
      .arrow.right {
        grid-area: 2 / 3;
      }
      .arrow.down {
        grid-area: 3 / 2;
      }
      .ok {
        grid-area: 2 / 2;
        border-radius: 50%;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        font: 600 16px / 1 var(--m3e-font-brand);
        transition:
          border-radius var(--m3e-spatial-fast),
          transform var(--m3e-spatial-fast);
      }
      .ok:active {
        border-radius: 30%;
      }
      .keys {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .key {
        flex: 1 1 0;
        height: 52px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font: 500 13px / 1 var(--m3e-font-plain);
        --m3e-icon-size: 24px;
      }
      .key:active {
        border-radius: 26px;
      }
      .key.on {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .rockers {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .rocker {
        display: flex;
        align-items: center;
        border-radius: 16px;
        background: var(--m3-surface-high);
        overflow: hidden;
      }
      .rocker .key {
        background: none;
        border-radius: 0;
      }
      .rocker .key:active {
        background: var(--m3-surface-highest);
      }
      .rocker .label {
        font: 500 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
      }
      :host([compact]) .pad {
        width: min(100%, 196px);
      }
      :host([compact]) .key {
        height: 44px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const ids = Object.keys(hass.states);
    const remote = ids.find((id) => id.startsWith('remote.'));
    const tv = ids.find((id) => id.startsWith('media_player.'));
    return { type: 'custom:m3e-remote-card', ...(tv ? { entity: tv } : {}), remote_entity: remote ?? 'remote.example' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', selector: { entity: { domain: 'media_player' } } },
        { name: 'remote_entity', selector: { entity: { domain: 'remote' } } },
        { name: 'name', selector: { text: {} } },
        {
          name: 'preset',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'generic', label: '汎用（up・down・select…）' },
                { value: 'android_tv', label: 'Android TV / Google TV' },
                { value: 'apple_tv', label: 'Apple TV' },
                { value: 'roku', label: 'Roku' },
                { value: 'samsung', label: 'Samsung' },
                { value: 'lg', label: 'LG webOS' },
              ],
            },
          },
        },
        { name: 'show_volume', default: true, selector: { boolean: {} } },
        { name: 'show_channels', default: true, selector: { boolean: {} } },
        { name: 'show_transport', default: true, selector: { boolean: {} } },
        { name: 'show_sources', default: true, selector: { boolean: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) =>
        ({
          entity: 'テレビ（メディアプレーヤー）',
          remote_entity: 'リモコン（remote）',
          preset: 'コマンドの種類',
          show_volume: '音量',
          show_channels: 'チャンネル',
          show_transport: '再生・早送り',
          show_sources: '入力の切り替え',
        })[s.name],
    };
  }

  protected normalizeConfig(config: RemoteCardConfig): RemoteCardConfig {
    if (!config.entity && !config.remote_entity) throw new Error('entity (media_player) or remote_entity is required');
    if (config.entity && domainOf(config.entity) !== 'media_player') throw new Error('entity must be a media_player');
    if (config.remote_entity && domainOf(config.remote_entity) !== 'remote') throw new Error('remote_entity must be a remote');
    if (config.preset && !(config.preset in PRESETS)) throw new Error(`preset must be one of: ${Object.keys(PRESETS).join(', ')}`);
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity, this.config.remote_entity].filter(Boolean) as string[];
  }

  protected override missingEntity(): string | undefined {
    const missing = super.missingEntity();
    if (missing) return missing;
    const r = this.config.remote_entity;
    return r && this.hass && Object.keys(this.hass.states).length && !this.hass.states[r] ? r : undefined;
  }

  protected override defaultAccent(): Accent {
    return 'mauve';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 8;
  }

  private get player() {
    return this.stateObj(this.config.entity);
  }

  private feat(bit: number): boolean {
    return (Number(this.player?.attributes.supported_features ?? 0) & bit) !== 0;
  }

  private command(key: Key): string {
    return this.config.commands?.[key] ?? PRESETS[this.config.preset ?? 'generic'][key] ?? BASE[key];
  }

  /** Send a key: its configured action, the media_player service, or the remote command. */
  private send(key: Key): void {
    fireHaptic(this, 'light');
    const custom = this.config.key_actions?.[key];
    if (custom) {
      this.runAction(custom, this.config.entity ?? this.config.remote_entity);
      return;
    }
    const mp = this.config.entity;
    if (mp && this.player) {
      const muted = !!this.player.attributes.is_volume_muted;
      const isOff = this.player.state === 'off';
      const direct: Partial<Record<Key, () => void>> = {
        power: this.feat(isOff ? MP.TURN_ON : MP.TURN_OFF) ? () => this.call('media_player', isOff ? 'turn_on' : 'turn_off', {}, mp) : undefined,
        volume_up: this.feat(MP.VOLUME_STEP) || this.feat(MP.VOLUME_SET) ? () => this.call('media_player', 'volume_up', {}, mp) : undefined,
        volume_down: this.feat(MP.VOLUME_STEP) || this.feat(MP.VOLUME_SET) ? () => this.call('media_player', 'volume_down', {}, mp) : undefined,
        mute: this.feat(MP.VOLUME_MUTE) ? () => this.call('media_player', 'volume_mute', { is_volume_muted: !muted }, mp) : undefined,
        play_pause: this.feat(MP.PAUSE) || this.feat(MP.PLAY) ? () => this.call('media_player', 'media_play_pause', {}, mp) : undefined,
      };
      // The media_player handles what it supports; the rest goes to the remote.
      const fn = direct[key];
      if (fn) {
        fn();
        return;
      }
    }
    const remote = this.config.remote_entity;
    if (!remote) return;
    if (key === 'power') {
      const r = this.stateObj(remote);
      this.call('remote', r?.state === 'off' ? 'turn_on' : 'turn_off', {}, remote);
      return;
    }
    this.call('remote', 'send_command', { command: this.command(key) }, remote);
  }

  private key(key: Key, icon: string, label: string, cls = '', text = '') {
    return html`<button class="icon-btn key ${cls}" aria-label=${label} title=${label} @click=${() => this.send(key)}>
      <m3e-icon .icon=${icon}></m3e-icon>${text}
    </button>`;
  }

  private arrow(key: Key, icon: string, label: string) {
    return html`<button
      class="icon-btn arrow ${key} ${this.pressedKey === key ? 'on' : ''}"
      aria-label=${label}
      @pointerdown=${() => (this.pressedKey = key)}
      @pointerup=${() => (this.pressedKey = '')}
      @pointerleave=${() => (this.pressedKey = '')}
      @click=${() => this.send(key)}
    >
      <m3e-icon .icon=${icon}></m3e-icon>
    </button>`;
  }

  /** Arrow keys on the focused card drive the D-pad too. */
  private onKeydown(e: KeyboardEvent): void {
    if (e.target !== e.currentTarget) return;
    const map: Record<string, Key> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Backspace: 'back' };
    const key = map[e.key];
    if (!key) return;
    e.preventDefault();
    this.send(key);
  }

  protected renderCard() {
    const c = this.config;
    const p = this.player;
    const r = this.stateObj(c.remote_entity);
    const main = p ?? r;
    const off = !main || isUnavailable(main);
    const on = main?.state !== 'off' && !off;
    const name = c.name ?? (main?.attributes.friendly_name as string | undefined) ?? c.entity ?? c.remote_entity ?? '';
    const source = p?.attributes.source as string | undefined;
    const app = (p?.attributes.app_name as string | undefined) ?? (r?.attributes.current_activity as string | undefined);
    const sources = c.show_sources !== false && this.feat(MP.SELECT_SOURCE) ? ((p?.attributes.source_list as string[] | undefined) ?? []) : [];
    const hasVolume = !!r || this.feat(MP.VOLUME_STEP) || this.feat(MP.VOLUME_SET);
    const muted = !!p?.attributes.is_volume_muted;
    return html`<div class="card ${off ? 'unavailable' : ''}" data-accent=${on ? nothing : 'neutral'} tabindex="0" @keydown=${this.onKeydown}>
      <div class="header">
        <div class="tap" @click=${() => this.tapEntity(c.entity ?? c.remote_entity)}>
          <m3e-shape .shape=${on ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44}><m3e-icon .icon=${c.icon ?? 'tv'}></m3e-icon></m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${off ? '利用不可' : on ? [app, source].filter(Boolean).join('・') || 'オン' : 'オフ'}</p>
          </div>
        </div>
        <button class="icon-btn round-btn" aria-label=${on ? '電源を切る' : '電源を入れる'} ?disabled=${off} @click=${() => this.send('power')}>
          <m3e-icon icon="power-settings-new"></m3e-icon>
        </button>
      </div>

      ${r || c.key_actions
        ? html`<div class="pad" role="group" aria-label="方向キー">
              ${this.arrow('up', 'keyboard-arrow-up', '上')} ${this.arrow('left', 'keyboard-arrow-left', '左')}
              <button class="icon-btn ok" aria-label="決定" @click=${() => this.send('ok')}>OK</button>
              ${this.arrow('right', 'keyboard-arrow-right', '右')} ${this.arrow('down', 'keyboard-arrow-down', '下')}
            </div>
            <div class="keys">
              ${this.key('back', 'arrow-back', '戻る')} ${this.key('home', 'home', 'ホーム')} ${this.key('menu', 'menu', 'メニュー')}
            </div>`
        : nothing}

      ${(c.show_volume !== false && hasVolume) || (c.show_channels !== false && r)
        ? html`<div class="rockers">
            ${c.show_volume !== false && hasVolume
              ? html`<div class="rocker" role="group" aria-label="音量">
                  ${this.key('volume_down', 'volume-down', '音量を下げる')}
                  <button class="icon-btn key ${muted ? 'on' : ''}" aria-label=${muted ? 'ミュートを解除' : 'ミュート'} @click=${() => this.send('mute')}>
                    <m3e-icon .icon=${muted ? 'volume-off' : 'volume-mute'}></m3e-icon>
                  </button>
                  ${this.key('volume_up', 'volume-up', '音量を上げる')}
                </div>`
              : nothing}
            ${c.show_channels !== false && r
              ? html`<div class="rocker" role="group" aria-label="チャンネル">
                  ${this.key('channel_down', 'keyboard-arrow-down', 'チャンネルを下げる')}
                  <span class="label">CH</span>
                  ${this.key('channel_up', 'keyboard-arrow-up', 'チャンネルを上げる')}
                </div>`
              : nothing}
          </div>`
        : nothing}

      ${c.show_transport !== false && (r || this.feat(MP.PAUSE) || this.feat(MP.PLAY))
        ? html`<div class="keys">
            ${r ? this.key('rewind', 'fast-rewind', '巻き戻し') : nothing}
            ${this.key('play_pause', p?.state === 'playing' ? 'pause' : 'play-arrow', '再生・一時停止', 'on')}
            ${r ? this.key('fast_forward', 'fast-forward', '早送り') : nothing}
          </div>`
        : nothing}

      ${sources.length
        ? html`<div class="chips" role="radiogroup" aria-label="入力">
            ${sources.map(
              (src) => html`<button
                class="chip ${src === source ? 'on' : ''}"
                role="radio"
                aria-checked=${src === source ? 'true' : 'false'}
                ?disabled=${!on}
                @click=${() => this.call('media_player', 'select_source', { source: src }, c.entity)}
              >
                ${src === source ? html`<m3e-icon icon="check"></m3e-icon>` : html`<m3e-icon icon="input"></m3e-icon>`}<span>${src}</span>
              </button>`,
            )}
          </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-remote-card', M3eRemoteCard);
