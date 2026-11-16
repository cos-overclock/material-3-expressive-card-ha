import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { hhmm, isUnavailable, numState } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';

interface Person {
  entity: string;
  name?: string;
  /** Avatar colour. Default: blue, pink, peach, teal, mauve… in order. */
  color?: Accent;
  /** Letter in the avatar. Default: the first character of the name. */
  initial?: string;
  /** Minutes until home (e.g. a Waze / Google travel-time sensor). Shows "帰宅中・約15分" while away. */
  eta_entity?: string;
  /** Use the person's picture instead of the initial. Default false. */
  show_picture?: boolean;
}

export interface PresenceCardConfig extends BaseCardConfig {
  people: (string | Person)[];
  /** Small line under the list, e.g. "全員が外出すると、自動で警備をオンにします". */
  footnote?: string;
  footnote_icon?: string;
}

const COLORS: Accent[] = ['blue', 'pink', 'peach', 'teal', 'mauve', 'yellow', 'green'];

type Where = 'home' | 'coming' | 'away' | 'unknown';

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Who is home: one row per person with an avatar, when they came home (or
 * where they are), and a chip — 在宅, 外出, or 帰宅中 with the travel time.
 *
 * Motion: chips re-tint on the effects spring and their text rolls when a
 * person arrives or leaves; a pressed row rounds its corners.
 */
export class M3ePresenceCard extends M3eBaseCard<PresenceCardConfig> {
  static override accentHint = '色を指定していない人のアイコンの色を変えます。在宅・帰宅中・外出のチップの色は変わりません。';

  @state() private now = Date.now();
  private timer?: ReturnType<typeof setInterval>;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .person {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 68px;
        padding: 12px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        cursor: pointer;
        transition: border-radius var(--m3e-spatial-fast);
      }
      .person:active {
        border-radius: 24px;
      }
      .avatar {
        flex: none;
        width: 44px;
        height: 44px;
        border-radius: 22px;
        display: grid;
        place-items: center;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 18px / 1 var(--m3e-font-plain);
        overflow: hidden;
        transition:
          border-radius var(--m3e-spatial-default),
          opacity var(--m3e-effects-default);
      }
      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .text {
        flex: 1;
        min-width: 0;
      }
      .name {
        font: 500 15px / 20px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state {
        display: flex;
        align-items: center;
        gap: 2px;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .state m3e-icon {
        --m3e-icon-size: 16px;
      }
      .chip {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 10px 0 8px;
        border-radius: 8px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 12px / 1 var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .chip m3e-icon {
        --m3e-icon-size: 16px;
      }
      .chip[data-accent='neutral'] {
        background: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .foot {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 4px 0;
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .foot m3e-icon {
        --m3e-icon-size: 16px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 12px;
        gap: 6px;
      }
      :host([compact]) .person {
        gap: 10px;
        min-height: 52px;
        padding: 8px 10px;
        border-radius: 14px;
      }
      :host([compact]) .avatar {
        width: 36px;
        height: 36px;
        border-radius: 18px;
        font-size: 15px;
      }
      :host([compact]) .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .state {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    return { type: 'custom:m3e-presence-card', people: Object.keys(hass.states).filter((id) => id.startsWith('person.')) };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'people', required: true, selector: { entity: { multiple: true, domain: 'person' } } },
        { name: 'footnote', selector: { text: {} } },
      ],
    };
  }

  protected normalizeConfig(config: PresenceCardConfig): PresenceCardConfig {
    if (!Array.isArray(config.people) || !config.people.length) throw new Error('people: list at least one person');
    return config;
  }

  private people(): Person[] {
    return this.config.people.map((p) => (typeof p === 'string' ? { entity: p } : p));
  }

  protected watchedEntities(): string[] {
    return this.people().flatMap((p) => [p.entity, p.eta_entity].filter(Boolean) as string[]);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 1 + this.people().length;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => (this.now = Date.now()), 60_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }

  private where(s: HassEntity | undefined, eta: number | undefined): Where {
    if (!s || isUnavailable(s)) return 'unknown';
    if (s.state === 'home') return 'home';
    return eta !== undefined && eta > 0 ? 'coming' : 'away';
  }

  /** "18:42 に帰宅", "今日は外出なし", "駅前の塾 → 自宅", "外出中・9:10 から". */
  private line(s: HassEntity | undefined, w: Where) {
    if (!s || w === 'unknown') return html`<span>${s ? '不明' : '見つかりません'}</span>`;
    const since = Date.parse(s.last_changed);
    if (w === 'home') {
      return html`<span>${since >= startOfToday(this.now) ? `${hhmm(since)} に帰宅` : '今日は外出なし'}</span>`;
    }
    // In a zone the state is the zone's name; outside every zone it is not_home.
    const place = s.state === 'not_home' ? '' : s.state;
    if (w === 'coming') {
      return html`<m3e-icon icon="location-on"></m3e-icon><span>${place || '外出先'} → 自宅</span>`;
    }
    return place
      ? html`<m3e-icon icon="location-on"></m3e-icon><span>${place}${since >= startOfToday(this.now) ? `・${hhmm(since)} から` : ''}</span>`
      : html`<span>外出中${since >= startOfToday(this.now) ? `・${hhmm(since)} から` : ''}</span>`;
  }

  private chip(w: Where, eta: number | undefined) {
    if (w === 'home') return html`<span class="chip" data-accent="green"><m3e-icon icon="home"></m3e-icon><m3e-rolling-text text="在宅"></m3e-rolling-text></span>`;
    if (w === 'coming')
      return html`<span class="chip" data-accent="yellow"
        ><m3e-icon icon="directions-walk"></m3e-icon><m3e-rolling-text .text=${`帰宅中・約${Math.round(eta!)}分`}></m3e-rolling-text
      ></span>`;
    if (w === 'away') return html`<span class="chip" data-accent="neutral"><m3e-icon icon="location-on"></m3e-icon><m3e-rolling-text text="外出"></m3e-rolling-text></span>`;
    return nothing;
  }

  protected override render() {
    return html`<div class="card">
      ${repeat(
        this.people(),
        (p) => p.entity,
        (p, i) => {
          const s = this.stateObj(p.entity);
          const eta = numState(this.stateObj(p.eta_entity));
          const w = this.where(s, eta);
          const name = p.name ?? (s?.attributes.friendly_name as string) ?? p.entity;
          const pic = p.show_picture ? (s?.attributes.entity_picture as string | undefined) : undefined;
          return html`<div
            class="person ${w === 'home' ? '' : 'away'} ${w === 'unknown' ? 'unavailable' : ''}"
            role="button"
            tabindex="0"
            @click=${() => this.moreInfo(p.entity)}
            @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && this.moreInfo(p.entity)}
          >
            <div class="avatar" data-accent=${p.color ?? this.config.color ?? COLORS[i % COLORS.length]} aria-hidden="true">
              ${pic ? html`<img src=${pic} alt="" />` : (p.initial ?? [...name][0])}
            </div>
            <div class="text">
              <p class="name">${name}</p>
              <p class="state">${this.line(s, w)}</p>
            </div>
            ${this.chip(w, eta)}
          </div>`;
        },
      )}
      ${this.config.footnote
        ? html`<p class="foot"><m3e-icon .icon=${this.config.footnote_icon ?? 'shield'}></m3e-icon>${this.config.footnote}</p>`
        : nothing}
    </div>`;
  }
}

define('m3e-presence-card', M3ePresenceCard);
