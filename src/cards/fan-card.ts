import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { checkEntity, type Issue } from '../editor/validate';
import { richCardStyles } from './shared-styles';
import { debounce, domainOf, isUnavailable } from '../ha/helpers';
import { formatSensor } from '../ha/format';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-switch';
import '../components/m3e-slider';
import '../components/m3e-button-group';
import '../components/m3e-rolling-text';

export interface FanCardConfig extends BaseCardConfig {
  /** fan (扇風機・サーキュレーター・空気清浄機) or humidifier (加湿器・除湿機). */
  entity: string;
  name?: string;
  icon?: string;
  /** Readings shown as chips: PM2.5, room humidity, filter life… */
  sensors?: string[];
  /** Fan speed slider. Default true. */
  show_speed?: boolean;
  /** Preset / mode buttons (preset_modes, available_modes). Default true. */
  show_modes?: boolean;
  /** Oscillation and direction chips. Default true. */
  show_oscillate?: boolean;
  /** Override labels of preset / mode values: { sleep: おやすみ } */
  labels?: Record<string, string>;
}

// FanEntityFeature / HumidifierEntityFeature
const SET_SPEED = 1;
const OSCILLATE = 2;
const DIRECTION = 4;
const PRESET_MODE = 8;
const HUMIDIFIER_MODES = 1;

/** Common preset / mode values in Japanese. */
const MODE_LABEL: Record<string, string> = {
  auto: '自動',
  smart: 'スマート',
  sleep: 'おやすみ',
  silent: '静音',
  quiet: '静音',
  nature: '自然風',
  breeze: 'そよ風',
  turbo: 'ターボ',
  boost: 'パワフル',
  eco: 'エコ',
  normal: '標準',
  home: '在宅',
  away: '外出',
  comfort: '快適',
  baby: 'ベビー',
  low: '弱',
  medium: '中',
  mid: '中',
  high: '強',
  favorite: 'お気に入り',
  manual: '手動',
};

const ACTION_LABEL: Record<string, string> = {
  humidifying: '加湿中',
  drying: '除湿中',
  idle: '待機中',
  off: '停止中',
};

/**
 * Fans, air purifiers and humidifiers: power, speed (or target humidity),
 * presets / modes, oscillation and direction, and a few readings.
 *
 * Motion: the shape turns while a fan runs; its colour and the speed read-out
 * follow the slider while dragging; the target humidity rolls with −/+.
 */
export class M3eFanCard extends M3eBaseCard<FanCardConfig> {
  /** Slider / target while dragging or until HA reports it. */
  @state() private pending?: number;
  private clearPending?: ReturnType<typeof setTimeout>;

  private send = debounce((v: number) => {
    const rounded = Math.round(v);
    if (this.isHumidifier) this.call('humidifier', 'set_humidity', { humidity: rounded }, this.config.entity);
    else if (rounded <= 0) this.call('fan', 'turn_off', {}, this.config.entity);
    else this.call('fan', 'set_percentage', { percentage: rounded }, this.config.entity);
    clearTimeout(this.clearPending);
    this.clearPending = setTimeout(() => (this.pending = undefined), 1500);
  }, 500);

  static override styles = [
    M3eBaseCard.styles,
    richCardStyles,
    css`
      .target {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .target .value {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .target .label {
        font: 500 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .modes {
        --m3e-group-height: 44px;
      }
      :host([compact]) .modes {
        --m3e-group-height: 40px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => /^(fan|humidifier)\./.test(id)) ?? 'fan.example';
    return { type: 'custom:m3e-fan-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: ['fan', 'humidifier'] } } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'sensors', selector: { entity: { multiple: true, domain: 'sensor' } } },
        { name: 'show_speed', default: true, selector: { boolean: {} } },
        { name: 'show_modes', default: true, selector: { boolean: {} } },
        { name: 'show_oscillate', default: true, selector: { boolean: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) =>
        ({
          sensors: '一緒に出す値（PM2.5・湿度など）',
          show_speed: '風量のスライダーを表示',
          show_modes: 'モードのボタンを表示',
          show_oscillate: '首振り・風向きを表示',
        })[s.name],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    return checkEntity(c, 'entity', ['fan', 'humidifier'], 'エンティティ', true);
  }

  protected normalizeConfig(config: FanCardConfig): FanCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity, ...(this.config.sensors ?? [])];
  }

  protected override defaultAccent(): Accent {
    return 'sky';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 5;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.send.cancel();
    clearTimeout(this.clearPending);
    this.clearPending = undefined;
    this.pending = undefined;
  }

  private get isHumidifier(): boolean {
    return domainOf(this.config.entity) === 'humidifier';
  }

  private has(s: HassEntity | undefined, bit: number): boolean {
    return (Number(s?.attributes.supported_features ?? 0) & bit) !== 0;
  }

  private label(value: string): string {
    return this.config.labels?.[value] ?? MODE_LABEL[value.toLowerCase()] ?? value;
  }

  private stateLine(s: HassEntity | undefined, on: boolean): string {
    if (!s) return '';
    if (isUnavailable(s)) return '利用不可';
    const a = s.attributes;
    if (this.isHumidifier) {
      if (!on) return 'オフ';
      const action = a.action ? (ACTION_LABEL[a.action] ?? a.action) : 'オン';
      return [action, a.mode ? this.label(a.mode) : '', a.current_humidity != null ? `湿度 ${Math.round(a.current_humidity)}%` : '']
        .filter(Boolean)
        .join('・');
    }
    if (!on) return 'オフ';
    return ['オン', a.preset_mode ? this.label(a.preset_mode) : '', a.percentage != null ? `${a.percentage}%` : '', a.oscillating ? '首振り' : '']
      .filter(Boolean)
      .join('・');
  }

  /** Fan: the speed slider in the entity's own steps. */
  private renderSpeed(s: HassEntity, on: boolean, off: boolean) {
    if (this.config.show_speed === false || !this.has(s, SET_SPEED)) return nothing;
    const step = Number(s.attributes.percentage_step ?? 1) || 1;
    const value = this.pending ?? (on ? Number(s.attributes.percentage ?? 0) : 0);
    return html`<div class="group">
      <div class="section-label"><span>風量</span><span class="current">${value ? `${Math.round(value)}%` : 'オフ'}</span></div>
      <m3e-slider
        label="風量"
        icon="mode-fan"
        .value=${value}
        min="0"
        max="100"
        .step=${step}
        ?disabled=${off}
        @input=${(e: CustomEvent<{ value: number }>) => (this.pending = e.detail.value)}
        @change=${(e: CustomEvent<{ value: number }>) => {
          this.pending = e.detail.value;
          this.send(e.detail.value);
        }}
      ></m3e-slider>
    </div>`;
  }

  /** Humidifier: the target humidity with −/+. */
  private renderTarget(s: HassEntity, on: boolean, off: boolean) {
    const a = s.attributes;
    const min = Number(a.min_humidity ?? 30);
    const max = Number(a.max_humidity ?? 80);
    const target = this.pending ?? (a.humidity != null ? Number(a.humidity) : undefined);
    const nudge = (dir: 1 | -1) => {
      if (target === undefined) return;
      const next = Math.min(max, Math.max(min, Math.round(target) + dir * 5));
      this.pending = next;
      this.send(next);
    };
    const disabled = off || !on || target === undefined;
    return html`<div class="target">
      <button class="icon-btn step" aria-label="目標湿度を下げる" ?disabled=${disabled || target! <= min} @click=${() => nudge(-1)}>
        <m3e-icon icon="remove"></m3e-icon>
      </button>
      <div class="value">
        <span class="big"><m3e-rolling-text .text=${target !== undefined ? `${Math.round(target)}%` : '—'}></m3e-rolling-text></span>
        <span class="label">目標湿度</span>
      </div>
      <button class="icon-btn step plus" aria-label="目標湿度を上げる" ?disabled=${disabled || target! >= max} @click=${() => nudge(1)}>
        <m3e-icon icon="add"></m3e-icon>
      </button>
    </div>`;
  }

  private renderModes(s: HassEntity, off: boolean) {
    if (this.config.show_modes === false) return nothing;
    const a = s.attributes;
    const list = this.isHumidifier
      ? this.has(s, HUMIDIFIER_MODES)
        ? ((a.available_modes as string[] | undefined) ?? [])
        : []
      : this.has(s, PRESET_MODE)
        ? ((a.preset_modes as string[] | undefined) ?? [])
        : [];
    if (!list.length) return nothing;
    const current = (this.isHumidifier ? a.mode : a.preset_mode) ?? '';
    const pick = (v: string) =>
      this.isHumidifier
        ? this.call('humidifier', 'set_mode', { mode: v }, this.config.entity)
        : this.call('fan', 'set_preset_mode', { preset_mode: v }, this.config.entity);
    // Many modes don't fit one row of buttons: chips wrap instead.
    return list.length <= 4
      ? html`<m3e-button-group
          class="modes"
          label="モード"
          .options=${list.map((m) => ({ value: m, label: this.label(m) }))}
          .value=${current}
          ?disabled=${off}
          @select=${(e: CustomEvent<{ value: string }>) => pick(e.detail.value)}
        ></m3e-button-group>`
      : html`<div class="chips" role="radiogroup" aria-label="モード">
          ${list.map(
            (m) => html`<button class="chip ${m === current ? 'on' : ''}" role="radio" aria-checked=${m === current ? 'true' : 'false'} ?disabled=${off} @click=${() => pick(m)}>
              ${m === current ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}<span>${this.label(m)}</span>
            </button>`,
          )}
        </div>`;
  }

  /** Oscillation, direction and the readings, as one row of chips. */
  private renderChips(s: HassEntity, off: boolean) {
    const a = s.attributes;
    const chips = [];
    if (!this.isHumidifier && this.config.show_oscillate !== false) {
      if (this.has(s, OSCILLATE)) {
        chips.push(html`<button
          class="chip ${a.oscillating ? 'on' : ''}"
          aria-pressed=${a.oscillating ? 'true' : 'false'}
          ?disabled=${off}
          @click=${() => this.call('fan', 'oscillate', { oscillating: !a.oscillating }, this.config.entity)}
        >
          <m3e-icon icon="sync"></m3e-icon><span>首振り</span>
        </button>`);
      }
      if (this.has(s, DIRECTION)) {
        const reverse = a.direction === 'reverse';
        chips.push(html`<button
          class="chip ${reverse ? 'on' : ''}"
          aria-pressed=${reverse ? 'true' : 'false'}
          ?disabled=${off}
          @click=${() => this.call('fan', 'set_direction', { direction: reverse ? 'forward' : 'reverse' }, this.config.entity)}
        >
          <m3e-icon .icon=${reverse ? 'rotate-left' : 'rotate-right'}></m3e-icon><span>${reverse ? '逆回転' : '正回転'}</span>
        </button>`);
      }
    }
    if (this.isHumidifier && a.current_humidity != null) {
      chips.push(html`<span class="chip"><m3e-icon icon="humidity-percentage"></m3e-icon><span>湿度 ${Math.round(a.current_humidity)}%</span></span>`);
    }
    for (const id of this.config.sensors ?? []) {
      const sensor = this.stateObj(id);
      if (!sensor) continue;
      const name = (sensor.attributes.friendly_name as string | undefined) ?? SENSOR_NAME[sensor.attributes.device_class] ?? id;
      chips.push(html`<span class="chip" role="button" tabindex="0" @click=${() => this.moreInfo(id)}>
        <m3e-icon .icon=${sensorIcon(sensor)}></m3e-icon><span>${name} ${formatSensor(sensor, this.hass)}</span>
      </span>`);
    }
    return chips.length ? html`<div class="chips">${chips}</div>` : nothing;
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    if (!s) return html`<div class="card unavailable"></div>`;
    const off = isUnavailable(s);
    const on = s.state === 'on';
    const name = this.config.name ?? (s.attributes.friendly_name as string | undefined) ?? this.config.entity;
    const icon = this.config.icon ?? (this.isHumidifier ? 'humidity-percentage' : /purif|清浄/i.test(`${this.config.entity} ${name}`) ? 'air-purifier-gen' : 'mode-fan');
    return html`<div class="card ${off ? 'unavailable' : ''}" data-accent=${on ? nothing : 'neutral'}>
      <div class="header">
        <div class="tap" @click=${() => this.tapEntity(this.config.entity)}>
          <m3e-shape .shape=${on ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?spin=${on && !this.isHumidifier}>
            <m3e-icon .icon=${icon}></m3e-icon>
          </m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${this.stateLine(s, on)}</p>
          </div>
        </div>
        <m3e-switch
          .checked=${on}
          ?disabled=${off}
          label="電源"
          @change=${() => this.call(this.isHumidifier ? 'humidifier' : 'fan', on ? 'turn_off' : 'turn_on', {}, this.config.entity)}
        ></m3e-switch>
      </div>
      ${this.isHumidifier ? this.renderTarget(s, on, off) : this.renderSpeed(s, on, off)} ${this.renderModes(s, off)} ${this.renderChips(s, off)}
    </div>`;
  }
}

/** Names for unnamed reading sensors. */
const SENSOR_NAME: Record<string, string> = {
  humidity: '湿度',
  temperature: '温度',
  pm25: 'PM2.5',
  pm10: 'PM10',
  pm1: 'PM1',
  aqi: '空気質',
  carbon_dioxide: 'CO₂',
  volatile_organic_compounds: 'VOC',
};

/** A glyph for a reading chip, by device class. */
function sensorIcon(s: HassEntity): string {
  switch (s.attributes.device_class) {
    case 'humidity':
      return 'humidity-percentage';
    case 'temperature':
      return 'thermometer';
    case 'pm25':
    case 'pm10':
    case 'pm1':
    case 'aqi':
    case 'volatile_organic_compounds':
      return 'air';
    case 'carbon_dioxide':
      return 'co2';
    default:
      return String(s.attributes.unit_of_measurement) === '%' ? 'tune' : 'sensors';
  }
}

define('m3e-fan-card', M3eFanCard);
