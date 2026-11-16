import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { field, listOf, idsToObjects } from '../editor/form-helpers';
import { defaultIconFor, stateText } from '../ha/domain';
import { formatSensor } from '../ha/format';
import { domainOf, isUnavailable } from '../ha/helpers';
import { summaryEntities, summaryText, type Summary } from '../ha/summary';
import type { HassEntity, HomeAssistant, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';

type Badge = {
  /** Small label on top. */
  name?: string;
  icon?: string;
  color?: Accent;
  /** Entity badges: replace the value line. Summary badges: the template, e.g. "{n}つ点灯中". */
  text?: string;
} & ({ entity: string } | Summary);

export interface BadgesCardConfig extends BaseCardConfig {
  badges: (string | Badge)[];
  /** start | center (default) | end */
  align?: 'start' | 'center' | 'end';
}

const SENSOR_ICON: Record<string, [string, Accent]> = {
  temperature: ['thermometer', 'red'],
  humidity: ['water-drop', 'blue'],
  power: ['bolt', 'peach'],
  energy: ['bolt', 'peach'],
  battery: ['battery-full', 'green'],
  carbon_dioxide: ['co2', 'green'],
  illuminance: ['sunny', 'yellow'],
};

const DOMAIN_ACCENT: Record<string, Accent> = {
  light: 'yellow',
  lock: 'green',
  cover: 'lavender',
  climate: 'peach',
  person: 'teal',
  media_player: 'mauve',
};

const asBadge = (b: string | Badge): Badge => (typeof b === 'string' ? { entity: b } : b);
// The editor may leave `type` empty on an entity badge.
const isEntity = (b: Badge): b is Badge & { entity: string } => 'entity' in b && typeof b.entity === 'string' && !(b as { type?: string }).type;

function entityValue(s: HassEntity | undefined, hass?: HomeAssistant): string {
  if (!s) return '—';
  if (domainOf(s.entity_id) === 'sensor') {
    // Same reading format as the headings: "21.8°", "48%", "1.24 kW".
    return formatSensor(s, hass);
  }
  return stateText(s);
}

/**
 * A row of HA-style badges: a pill with an icon, a small label and the value.
 * A badge is an entity, or a live summary of several (`type: count` — "3つ点灯中",
 * `type: average` — "21.8°").
 *
 * Motion: values roll when they change; a pressed badge squashes its corners
 * and the icon pops when an entity changes state.
 */
export class M3eBadgesCard extends M3eBaseCard<BadgesCardConfig> {
  static override accentHint = '色を指定していないバッジのうち、種類（ドメインやデバイスクラス）から色が決まらないものに使います。';

  @state() private pressed = -1;

  static override styles = [
    M3eBaseCard.styles,
    css`
      :host {
        --badge-bg: #ffffff;
      }
      :host([theme='mocha']) {
        --badge-bg: #181825;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        padding: 4px 0;
      }
      .row.start {
        justify-content: flex-start;
      }
      .row.end {
        justify-content: flex-end;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 16px 0 12px;
        border-radius: 20px;
        background: var(--badge-bg);
        box-shadow: inset 0 0 0 1px var(--m3-outline-variant);
        color: var(--m3-on-surface);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition:
          border-radius var(--m3e-spatial-fast),
          transform var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }
      .badge.static {
        cursor: default;
      }
      .badge.pressed {
        border-radius: 12px;
        transform: scale(0.96);
      }
      .badge:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .badge m3e-icon {
        --m3e-icon-size: 20px;
        color: var(--accent-fill);
      }
      .badge[data-accent='neutral'] m3e-icon {
        color: var(--m3-on-surface-variant);
      }
      .text {
        display: flex;
        flex-direction: column;
        line-height: 1;
      }
      .k {
        font: 400 11px / 14px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .v {
        font: 500 13px / 17px var(--m3e-font-plain);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .badge {
        height: 36px;
        gap: 6px;
        padding: 0 14px 0 10px;
      }
      :host([compact]) .badge m3e-icon {
        --m3e-icon-size: 18px;
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-badges-card', badges: [{ type: 'count', domain: 'light', name: '照明', text: '{n}つ点灯中', icon: 'lightbulb' }] };
  }

  static getConfigForm() {
    return {
      schema: [
        listOf(
          'badges',
          {
            entity: field.entity('エンティティ（1つを表示）'),
            type: field.select('まとめ方（エンティティの代わり）', [
              { value: 'count', label: '件数（count）' },
              { value: 'average', label: '平均（average）' },
            ]),
            domain: field.text('数えるドメイン（count、例：light）'),
            entities: field.entities('まとめるエンティティ'),
            state: field.texts('数える状態（count、省略で「動いている」状態）'),
            name: field.text('名前'),
            icon: field.icon(),
            color: field.accent(),
            text: field.text('文言（{n}・{rest}・{unknown}・{total} が使える）'),
            zero_text: field.text('0件のときの文言'),
            unknown_text: field.text('状態がわからないときに足す文言（既定：{unknown}件不明）'),
            decimals: field.number('小数点以下の桁数（average）', { min: 0, max: 3 }),
          },
          'name',
          'entity',
          true,
        ),
        { name: 'align', selector: { select: { options: ['start', 'center', 'end'] } } },
      ],
      toForm: (c: Record<string, unknown>) => idsToObjects(c, 'badges'),
    };
  }

  protected normalizeConfig(config: BadgesCardConfig): BadgesCardConfig {
    if (!Array.isArray(config.badges) || !config.badges.length) throw new Error('badges: list at least one badge');
    return config;
  }

  private badges(): Badge[] {
    return this.config.badges.map(asBadge);
  }

  protected watchedEntities(): string[] {
    return this.badges().flatMap((b) => (isEntity(b) ? [b.entity] : summaryEntities(this.hass, b as Summary)));
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 'full', rows: 'auto' };
  }

  override getCardSize(): number {
    return 1;
  }

  private look(b: Badge): { icon: string; accent: Accent | 'neutral'; name: string; value: string; entity?: string } {
    if (isEntity(b)) {
      const s = this.stateObj(b.entity);
      const dc = s?.attributes.device_class as string | undefined;
      const [sIcon, sAccent] = SENSOR_ICON[dc ?? ''] ?? [];
      const domain = domainOf(b.entity);
      const icon = b.icon ?? (s?.attributes.icon as string) ?? (domain === 'sensor' ? (sIcon ?? 'sensors') : defaultIconFor(s, b.entity));
      const accent = b.color ?? (isUnavailable(s) ? 'neutral' : (sAccent ?? DOMAIN_ACCENT[domain] ?? this.config.color ?? 'blue'));
      return {
        icon,
        accent,
        name: b.name ?? (s?.attributes.friendly_name as string) ?? b.entity,
        value: b.text ?? entityValue(s, this.hass),
        entity: b.entity,
      };
    }
    const sum = b as Badge & Summary;
    return {
      icon: b.icon ?? (sum.type === 'count' && sum.domain === 'light' ? 'lightbulb' : 'sensors'),
      accent: b.color ?? (sum.type === 'count' && sum.domain ? DOMAIN_ACCENT[sum.domain] : undefined) ?? this.config.color ?? 'blue',
      name: b.name ?? '',
      value: summaryText(this.hass, sum),
      entity: summaryEntities(this.hass, sum).length === 1 ? summaryEntities(this.hass, sum)[0] : undefined,
    };
  }

  protected renderCard() {
    return html`<div class="row ${this.config.align ?? ''}">
      ${repeat(
        this.badges(),
        (_, i) => i,
        (b, i) => {
          const l = this.look(b);
          const interactive = !!l.entity;
          return html`<div
            class="badge ${interactive ? '' : 'static'} ${this.pressed === i ? 'pressed' : ''}"
            data-accent=${l.accent}
            role=${interactive ? 'button' : nothing}
            tabindex=${interactive ? 0 : nothing}
            aria-label="${l.name} ${l.value}"
            @click=${() => interactive && this.moreInfo(l.entity)}
            @keydown=${(e: KeyboardEvent) => interactive && (e.key === 'Enter' || e.key === ' ') && this.moreInfo(l.entity)}
            @pointerdown=${() => interactive && (this.pressed = i)}
            @pointerup=${() => (this.pressed = -1)}
            @pointerleave=${() => (this.pressed = -1)}
          >
            <m3e-icon .icon=${l.icon}></m3e-icon>
            <span class="text">
              ${l.name ? html`<span class="k">${l.name}</span>` : nothing}
              <span class="v"><m3e-rolling-text .text=${l.value}></m3e-rolling-text></span>
            </span>
          </div>`;
        },
      )}
    </div>`;
  }
}

define('m3e-badges-card', M3eBadgesCard);
