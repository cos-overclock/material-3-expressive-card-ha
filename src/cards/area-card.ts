import { css, html, nothing } from 'lit';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { richCardStyles } from './shared-styles';
import { domainOf, isUnavailable } from '../ha/helpers';
import { formatSensor } from '../ha/format';
import { HVAC_LABEL } from '../ha/labels';
import type { HassEntity, HomeAssistant, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';

export interface AreaCardConfig extends BaseCardConfig {
  /** HA area id (設定 → エリア). */
  area: string;
  name?: string;
  icon?: string;
  /** Readings in the header. Default: the area's first temperature / humidity sensor. */
  temperature_entity?: string;
  humidity_entity?: string;
  /** Leave these out of the counts. */
  exclude_entities?: string[];
  /** Tap the header to open this page (same as tap_action: navigate). */
  navigation_path?: string;
  /** The lights chip turns the area's lights on / off. Default true. */
  show_light_toggle?: boolean;
}

const MOTION = new Set(['motion', 'occupancy', 'presence']);
const OPENING = new Set(['door', 'window', 'opening', 'garage_door']);

/** The entities in an area, by the registries (entity area, else its device's). Cached per registry. */
const areaCache = new WeakMap<object, Map<string, string[]>>();

export function areaEntities(hass: HomeAssistant | undefined, area: string): string[] {
  const reg = hass?.entities;
  if (!reg) return [];
  let byArea = areaCache.get(reg);
  if (!byArea) {
    byArea = new Map();
    areaCache.set(reg, byArea);
  }
  const hit = byArea.get(area);
  if (hit) return hit;
  const ids = Object.values(reg)
    .filter((e) => !e.hidden && !e.entity_category)
    .filter((e) => (e.area_id ?? (e.device_id ? hass!.devices?.[e.device_id]?.area_id : undefined)) === area)
    .map((e) => e.entity_id);
  byArea.set(area, ids);
  return ids;
}

/**
 * One room at a glance: temperature and humidity in the header, then chips
 * for what's going on — lights on (tap to switch them all), someone moving,
 * doors and windows open, the air conditioner, covers, media.
 *
 * Motion: the shape fills and morphs to a cookie while anything in the room
 * is on; chips re-tint on the effects spring.
 */
export class M3eAreaCard extends M3eBaseCard<AreaCardConfig> {
  static override accentHint = 'アイコンと、点灯中・動作中のチップの色を変えます。';

  static override styles = [
    M3eBaseCard.styles,
    richCardStyles,
    css`
      .readings {
        font: 500 15px / 22px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
    `,
  ];

  static getStubConfig(hass: HomeAssistant) {
    const area = Object.keys(hass.areas ?? {})[0] ?? 'living_room';
    return { type: 'custom:m3e-area-card', area };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'area', required: true, selector: { area: {} } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'temperature_entity', selector: { entity: { domain: 'sensor', device_class: 'temperature' } } },
        { name: 'humidity_entity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
        { name: 'exclude_entities', selector: { entity: { multiple: true } } },
        { name: 'navigation_path', selector: { navigation: {} } },
        { name: 'show_light_toggle', default: true, selector: { boolean: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) =>
        ({
          area: 'エリア',
          temperature_entity: '温度センサー',
          humidity_entity: '湿度センサー',
          exclude_entities: '数えないエンティティ',
          navigation_path: 'タップで開くページ',
          show_light_toggle: '照明のチップで一括点灯・消灯',
        })[s.name],
    };
  }

  protected normalizeConfig(config: AreaCardConfig): AreaCardConfig {
    if (!config.area) throw new Error('area is required');
    return config;
  }

  private ids(): string[] {
    const exclude = new Set(this.config.exclude_entities ?? []);
    return areaEntities(this.hass, this.config.area).filter((id) => !exclude.has(id));
  }

  protected watchedEntities(): string[] {
    return [...this.ids(), this.config.temperature_entity, this.config.humidity_entity].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'yellow';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 3;
  }

  private of(domain: string, deviceClasses?: Set<string>): HassEntity[] {
    return this.ids()
      .filter((id) => domainOf(id) === domain)
      .map((id) => this.stateObj(id))
      .filter((s): s is HassEntity => !!s && (!deviceClasses || deviceClasses.has(s.attributes.device_class)));
  }

  private reading(configured: string | undefined, dc: string): HassEntity | undefined {
    if (configured) return this.stateObj(configured);
    return this.of('sensor', new Set([dc])).find((s) => !isUnavailable(s));
  }

  private tap(): void {
    if (this.config.tap_action) this.runAction(this.config.tap_action, undefined);
    else if (this.config.navigation_path) this.runAction({ action: 'navigate', navigation_path: this.config.navigation_path }, undefined);
  }

  private toggleLights(lights: HassEntity[]): void {
    const anyOn = lights.some((l) => l.state === 'on');
    const ids = lights.filter((l) => !isUnavailable(l)).map((l) => l.entity_id);
    if (ids.length) this.hass?.callService('light', anyOn ? 'turn_off' : 'turn_on', {}, { entity_id: ids });
  }

  protected renderCard() {
    const area = this.hass?.areas?.[this.config.area];
    const name = this.config.name ?? area?.name ?? this.config.area;
    const icon = this.config.icon ?? area?.icon ?? 'meeting-room';
    const temp = this.reading(this.config.temperature_entity, 'temperature');
    const hum = this.reading(this.config.humidity_entity, 'humidity');
    const readings = [temp ? formatSensor(temp, this.hass) : '', hum ? formatSensor(hum, this.hass) : ''].filter(Boolean).join(' · ');

    const lights = this.of('light');
    const lightsOn = lights.filter((l) => l.state === 'on');
    const motion = this.of('binary_sensor', MOTION);
    const moving = motion.filter((m) => m.state === 'on');
    const openings = this.of('binary_sensor', OPENING);
    const open = openings.filter((o) => o.state === 'on');
    const climates = this.of('climate');
    const covers = this.of('cover');
    const coversOpen = covers.filter((c) => c.state === 'open' || c.state === 'opening');
    const media = this.of('media_player').filter((m) => m.state === 'playing');
    const active = lightsOn.length > 0 || moving.length > 0 || climates.some((c) => c.state !== 'off' && !isUnavailable(c)) || media.length > 0;

    const chips = [];
    if (lights.length) {
      const toggle = this.config.show_light_toggle !== false;
      chips.push(html`<button
        class="chip ${lightsOn.length ? 'on' : ''}"
        aria-label=${toggle ? (lightsOn.length ? `${name}の照明をすべて消す` : `${name}の照明をすべてつける`) : '照明'}
        @click=${() => (toggle ? this.toggleLights(lights) : this.moreInfo(lights[0].entity_id))}
      >
        <m3e-icon icon="lightbulb"></m3e-icon><span>${lightsOn.length ? `${lightsOn.length}つ点灯` : '消灯'}</span>
      </button>`);
    }
    if (motion.length) {
      chips.push(html`<button class="chip ${moving.length ? 'on' : ''}" @click=${() => this.moreInfo((moving[0] ?? motion[0]).entity_id)}>
        <m3e-icon icon="sensor-occupied"></m3e-icon><span>${moving.length ? '人がいます' : '人はいません'}</span>
      </button>`);
    }
    if (openings.length) {
      chips.push(html`<button class="chip ${open.length ? 'warn' : ''}" @click=${() => this.moreInfo((open[0] ?? openings[0]).entity_id)}>
        <m3e-icon .icon=${open.length ? 'door-open' : 'door-front'}></m3e-icon><span>${open.length ? `${open.length}か所が開` : 'すべて閉'}</span>
      </button>`);
    }
    for (const c of climates) {
      const on = c.state !== 'off' && !isUnavailable(c);
      const target = c.attributes.temperature;
      chips.push(html`<button class="chip ${on ? 'on' : ''}" @click=${() => this.moreInfo(c.entity_id)}>
        <m3e-icon icon="thermostat"></m3e-icon><span>${isUnavailable(c) ? '利用不可' : on ? `${HVAC_LABEL[c.state] ?? c.state}${target != null ? ` ${target}°` : ''}` : 'エアコン停止'}</span>
      </button>`);
    }
    if (covers.length) {
      chips.push(html`<button class="chip" @click=${() => this.moreInfo((coversOpen[0] ?? covers[0]).entity_id)}>
        <m3e-icon .icon=${coversOpen.length ? 'curtains' : 'curtains-closed'}></m3e-icon><span>${coversOpen.length ? `カーテン ${coversOpen.length}か所が開` : 'カーテン閉'}</span>
      </button>`);
    }
    for (const m of media) {
      chips.push(html`<button class="chip on" @click=${() => this.moreInfo(m.entity_id)}>
        <m3e-icon icon="speaker"></m3e-icon><span>${(m.attributes.media_title as string | undefined) ?? '再生中'}</span>
      </button>`);
    }

    const linked = this.config.tap_action ? this.config.tap_action.action !== 'none' : !!this.config.navigation_path;
    return html`<div class="card" data-accent=${active ? nothing : 'neutral'}>
      <div class="header">
        <div class="tap" style=${linked ? '' : 'cursor:default'} role=${linked ? 'link' : nothing} tabindex=${linked ? '0' : nothing} @click=${this.tap}>
          <m3e-shape .shape=${active ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44}><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${active ? '使用中' : 'すべてオフ'}</p>
          </div>
        </div>
        ${readings ? html`<span class="readings">${readings}</span>` : nothing}
      </div>
      ${chips.length ? html`<div class="chips">${chips}</div>` : html`<p class="empty">このエリアに表示できる機器がありません</p>`}
    </div>`;
  }
}

define('m3e-area-card', M3eAreaCard);
