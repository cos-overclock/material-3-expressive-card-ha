import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, actionsSection, press, PressGesture, type BaseCardConfig } from './base-card';
import { defaultAccentFor, defaultIconFor, stateText } from '../ha/domain';
import { domainOf, isActive, isUnavailable, relativeTime, toggleEntity } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-switch';

/**
 * auto (default): tile, or row under the compact density.
 * tile: two rows, 6 columns. row: one row, 6 columns.
 * mini: one row, 4 columns (three to a line); icon only at 3 columns.
 */
export type TileLayout = 'auto' | 'tile' | 'row' | 'mini';
const LAYOUTS: TileLayout[] = ['auto', 'tile', 'row', 'mini'];

/** Domains that run something when pressed rather than switch on and off. */
const PRESS_DOMAINS = new Set(['scene', 'script', 'button', 'input_button']);
/** How long a pressed button stays lit (ms). */
const FLASH_MS = 1200;

export interface TileCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  icon?: string;
  layout?: TileLayout;
  /** Show the switch. Default: shown on the two-row tile, hidden on row and mini, never on buttons. */
  show_switch?: boolean;
  /** Replace the state line while on, e.g. "運転中". */
  state_text_on?: string;
  /** Extra entity appended to the state line, e.g. remaining time. */
  secondary_entity?: string;
  secondary_prefix?: string;
}

/**
 * Two-row tile (184×120 in the design): icon shape + switch, name + state.
 *
 * Off: neutral surface, circular shape. On: accent container, 9-point cookie.
 * Toggling morphs circle ⇄ cookie with a one-period rotation on the spatial
 * spring while colours cross-fade on the effects spring. Pressing the tile
 * scales it and its shape down a little.
 *
 * Scenes, scripts and buttons work as one-shot buttons: a tap runs them, the
 * tile lights up for a moment (the same morph), and the state line says when
 * it last ran.
 */
export class M3eTileCard extends M3eBaseCard<TileCardConfig> {
  private gesture = new PressGesture(
    this,
    () => this.tap(),
    () => this.handleAction('hold', 'more-info'),
    this.doubleTap,
  );

  /** True for a moment after a scene / script / button is pressed. */
  @state() private flash = false;
  private flashTimer?: ReturnType<typeof setTimeout>;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        height: 120px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        transition: color var(--m3e-effects-default);
      }
      .name {
        font: 500 15px / 22px var(--m3e-font-plain);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .state {
        font: 400 13px / 20px var(--m3e-font-plain);
        opacity: 0.8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      [data-accent='neutral'] .state {
        color: var(--m3-on-surface-variant);
        opacity: 1;
      }

      /* row: one row (56px) — shape, name and state; the tile itself toggles. */
      .card.row {
        height: 100%;
        min-height: 56px;
        padding: 6px 10px 6px 8px;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 10px;
      }
      .row .text {
        flex: 1;
        min-width: 0;
      }
      .row .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .row .state {
        font: 400 12px / 16px var(--m3e-font-plain);
      }

      /* mini: one row in a third of the section — a smaller shape, name and state. */
      :host([layout='mini']) {
        container-type: inline-size;
      }
      .card.mini {
        gap: 8px;
        padding: 0 10px 0 8px;
      }
      .mini m3e-icon {
        --m3e-icon-size: 20px;
      }
      .mini .name {
        font: 500 13px / 18px var(--m3e-font-plain);
      }
      .mini .state {
        font: 400 11px / 16px var(--m3e-font-plain);
      }
      /* At a quarter of the section there is only room for the icon. */
      @container (max-width: 111px) {
        .card.mini {
          justify-content: center;
          padding: 0;
        }
        .mini .text {
          display: none;
        }
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => /^(light|switch|fan)\./.test(id)) ?? 'light.example';
    return { type: 'custom:m3e-tile-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: {} } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'layout', selector: { select: { options: LAYOUTS } } },
        { name: 'show_switch', selector: { boolean: {} } },
        { name: 'secondary_entity', selector: { entity: {} } },
        { name: 'secondary_prefix', selector: { text: {} } },
        actionsSection(),
      ],
    };
  }

  protected normalizeConfig(config: TileCardConfig): TileCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (config.layout && !LAYOUTS.includes(config.layout)) throw new Error(`layout must be one of: ${LAYOUTS.join(', ')}`);
    return config;
  }

  /** Scene / script / button tiles say when they last ran ("3分前"): keep it fresh. */
  protected override clockInterval(): number {
    return this.isPress() ? 30_000 : 0;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity, this.config.secondary_entity].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return defaultAccentFor(this.config.entity);
  }

  /** The layout drawn now: `auto` follows the density. */
  private mode(): Exclude<TileLayout, 'auto'> {
    const layout = this.config.layout ?? 'auto';
    if (layout !== 'auto') return layout;
    return this.isCompact() ? 'row' : 'tile';
  }

  private isPress(): boolean {
    return PRESS_DOMAINS.has(domainOf(this.config.entity));
  }

  override getGridOptions(): LovelaceGridOptions {
    switch (this.mode()) {
      case 'mini':
        return { columns: 4, rows: 1, min_columns: 3, min_rows: 1, max_rows: 1 };
      case 'row':
        return { columns: 6, rows: 1, min_columns: 4, min_rows: 1 };
      default:
        return { columns: 6, rows: 2, min_columns: 4, min_rows: 2 };
    }
  }

  override getCardSize(): number {
    return this.mode() === 'tile' ? 2 : 1;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.flashTimer);
    this.flash = false;
  }

  private tap(): void {
    const action = this.actionFor('tap', 'toggle');
    this.runAction(action, this.config.entity);
    if (action.action === 'toggle' && !action.confirmation && this.isPress() && this.stateObj(this.config.entity)?.state !== 'unavailable') {
      clearTimeout(this.flashTimer);
      this.flash = true;
      this.flashTimer = setTimeout(() => (this.flash = false), FLASH_MS);
    }
  }

  /** When a scene / script / button last ran ("3分前"); "実行中" while a script runs. */
  private pressLine(): string {
    const s = this.stateObj(this.config.entity);
    if (!s || s.state === 'unavailable') return stateText(s);
    if (this.flash) return '実行しました';
    const script = domainOf(this.config.entity) === 'script';
    if (script && s.state === 'on') return '実行中';
    // scene / button: the state is the last run's timestamp ('unknown' if never).
    const ago = relativeTime(script ? (s.attributes.last_triggered as string | undefined) : s.state);
    if (!ago) return '未実行';
    return ago === 'たった今' ? '実行しました' : ago;
  }

  private stateLine(): string {
    if (this.isPress()) return this.pressLine();
    const s = this.stateObj(this.config.entity);
    let text = isActive(s) && this.config.state_text_on ? this.config.state_text_on : stateText(s);
    const extra = this.stateObj(this.config.secondary_entity);
    if (extra && isActive(s)) {
      const unit = extra.attributes.unit_of_measurement ?? '';
      text += `・${this.config.secondary_prefix ?? ''}${extra.state}${unit}`;
    }
    return text;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const mode = this.mode();
    if (this.getAttribute('layout') !== mode) this.setAttribute('layout', mode);
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    const button = this.isPress();
    const on = isActive(s) || this.flash;
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    // Scenes, scripts and buttons usually carry their own icon.
    const icon = this.config.icon ?? ((button && (s?.attributes.icon as string | undefined)) || defaultIconFor(s, this.config.entity));
    const pressed = this.gesture.pressed;
    // A button that has never been pressed is 'unknown' but still usable.
    const unavailable = button ? !s || s.state === 'unavailable' : isUnavailable(s);
    const stateLine = this.stateLine();
    const sw = html`<m3e-switch
      .checked=${on}
      ?disabled=${isUnavailable(s)}
      label=${name}
      @change=${() => s && this.hass && toggleEntity(this.hass, s).catch((e) => console.warn(`${this.localName}: toggle failed`, e))}
    ></m3e-switch>`;
    const mode = this.mode();
    if (mode !== 'tile') {
      const mini = mode === 'mini';
      return html`<div
        class="card row ${mini ? 'mini' : ''} interactive ${pressed ? 'pressed' : ''} ${unavailable ? 'unavailable' : ''}"
        data-accent=${on ? nothing : 'neutral'}
        role="button"
        tabindex="0"
        aria-label=${`${name} ${stateLine}`}
        aria-pressed=${button ? nothing : on ? 'true' : 'false'}
        ${press(this.gesture)}
      >
        <m3e-shape .shape=${on ? 'cookie9' : 'circle'} size=${mini ? 36 : 40} ?pressed=${pressed}>
          <m3e-icon .icon=${icon}></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="name">${name}</p>
          <p class="state">${stateLine}</p>
        </div>
        ${!mini && !button && this.config.show_switch === true ? sw : nothing}
      </div>`;
    }
    return html`<div
      class="card interactive ${pressed ? 'pressed' : ''} ${unavailable ? 'unavailable' : ''}"
      data-accent=${on ? nothing : 'neutral'}
      role="button"
      tabindex="0"
      aria-label=${name}
      ${press(this.gesture)}
    >
      <div class="top">
        <m3e-shape .shape=${on ? 'cookie9' : 'circle'} size="44" ?pressed=${pressed}>
          <m3e-icon .icon=${icon}></m3e-icon>
        </m3e-shape>
        ${button || this.config.show_switch === false ? nothing : sw}
      </div>
      <div>
        <p class="name">${name}</p>
        <p class="state">${stateLine}</p>
      </div>
    </div>`;
  }
}

define('m3e-tile-card', M3eTileCard);
