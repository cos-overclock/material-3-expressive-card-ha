import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, actionsSection, TAP_ACTION_FIELD, type BaseCardConfig } from './base-card';
import { field, listOf } from '../editor/form-helpers';
import { hhmm, isUnavailable, numState } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';

interface Room {
  name: string;
  /** Segment / room id the vacuum knows the room by. */
  segment?: number | string;
  /** Floor area in m², for "12 / 18 m²". */
  area?: number;
  /** Picked when the card loads. */
  selected?: boolean;
}

export interface VacuumCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  battery_entity?: string;
  /** Sensors shown while cleaning. */
  current_room_entity?: string;
  progress_entity?: string;
  remaining_entity?: string;
  cleaned_area_entity?: string;
  /** Rooms to pick before starting. */
  rooms?: Room[];
  /**
   * How to clean the picked rooms. Default: vacuum.send_command with
   * app_segment_clean (Roborock / Xiaomi). A script gets { segments, rooms }.
   */
  room_service?: string;
  /** Footer: last run (timestamp), its duration and a consumable (filter). */
  last_clean_entity?: string;
  last_clean_duration_entity?: string;
  filter_entity?: string;
  filter_name?: string;
  /** Suction power chips (fan_speed_list). Default true; shown when the vacuum has speeds. */
  show_fan_speed?: boolean;
}

// VacuumEntityFeature
const FAN_SPEED = 32;
const LOCATE = 512;

/** Common fan_speed values in Japanese; others show as reported. */
const FAN_SPEED_LABEL: Record<string, string> = {
  off: 'オフ',
  silent: '静か',
  quiet: '静か',
  gentle: '弱',
  low: '弱',
  min: '弱',
  standard: '標準',
  balanced: '標準',
  medium: '中',
  normal: '標準',
  high: '強',
  strong: '強',
  turbo: 'ターボ',
  max: '最大',
  'max+': '最大+',
  auto: '自動',
  mop: 'モップ',
  custom: 'カスタム',
};

const STATE_LABEL: Record<string, string> = {
  cleaning: '掃除中',
  docked: '充電台',
  idle: '待機中',
  paused: '一時停止中',
  returning: '充電台へ戻っています',
  error: 'エラー',
  unavailable: '利用不可',
};

const RUNNING = new Set(['cleaning', 'returning']);

/** Seconds / minutes / hours → "32分", "1時間5分". */
function duration(s: HassEntity | undefined): string {
  const v = numState(s);
  if (v === undefined) return '';
  const unit = String(s!.attributes.unit_of_measurement ?? 'min');
  const min = unit === 's' ? v / 60 : unit === 'h' ? v * 60 : unit === 'd' ? v * 1440 : v;
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;
}

function dayWord(t: number): string {
  const d = new Date(t);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400_000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Robot vacuum: status and battery, a progress panel while cleaning (room,
 * percentage, time left, area, next room), room chips to pick what to clean,
 * pause / stop / dock, and the last run and filter life.
 *
 * Motion: the cookie turns while the vacuum is cleaning and settles when it
 * docks; the progress panel unfolds on the spatial spring and its bar glides
 * on the effects spring; room chips round and gain a check when picked;
 * buttons widen and round while pressed.
 */
export class M3eVacuumCard extends M3eBaseCard<VacuumCardConfig> {
  @state() private picked = new Set<string>();
  @state() private pressed = '';
  private pickedInit = false;

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
        font: 500 16px / 20px var(--m3e-font-plain);
      }
      .state {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .locate {
        width: 40px;
        height: 40px;
        border-radius: 20px;
        color: var(--m3-on-surface-variant);
        --m3e-icon-size: 20px;
      }
      .locate:active {
        border-radius: 12px;
      }
      .battery {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 10px 0 8px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        font: 500 12px / 1 var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .battery m3e-icon {
        --m3e-icon-size: 16px;
        color: var(--m3-on-surface-variant);
      }
      .battery.low {
        background: var(--acc-red-container);
        color: var(--acc-on-red-container);
      }
      .battery.low m3e-icon {
        color: inherit;
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
      .progress {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: 12px;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .where {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .where .pct {
        margin-left: 8px;
        font: 400 20px / 24px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .eta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font: 500 12px / 16px var(--m3e-font-plain);
        white-space: nowrap;
      }
      .eta m3e-icon {
        --m3e-icon-size: 16px;
      }
      .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--accent-track);
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: 4px;
        background: var(--accent-fill);
        transition: width var(--m3e-effects-slow);
      }
      /* Mocha containers are the fill colour itself: draw the bar in the text colour. */
      :host([theme='mocha']) .bar {
        background: color-mix(in srgb, var(--accent-on-container) 22%, var(--accent-container));
      }
      :host([theme='mocha']) .bar i {
        background: var(--accent-on-container);
      }
      .meta {
        display: flex;
        justify-content: space-between;
        font: 400 12px / 16px var(--m3e-font-plain);
        font-variant-numeric: tabular-nums;
      }
      .rooms {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .label {
        display: flex;
        justify-content: space-between;
        padding: 0 4px;
        font: 500 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .label span:last-child {
        font-weight: 400;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 13px / 1 var(--m3e-font-plain);
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default),
          border-radius var(--m3e-spatial-fast),
          padding var(--m3e-spatial-fast);
      }
      .chip m3e-icon {
        --m3e-icon-size: 16px;
      }
      .chip.on {
        padding-left: 8px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .chip:active {
        border-radius: 16px;
        transform: none;
      }
      .chip[disabled] {
        opacity: 0.5;
        pointer-events: none;
      }
      .actions {
        display: flex;
        gap: 4px;
        height: 48px;
      }
      .act {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 13px / 1 var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          flex-grow var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .act.primary {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .act.pressed {
        flex-grow: 1.3;
        border-radius: 24px;
      }
      .act:active {
        transform: none;
      }
      .act[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .act m3e-icon {
        --m3e-icon-size: 18px;
      }
      .act .stop-glyph {
        width: 9px;
        height: 9px;
        border-radius: 1.5px;
        background: currentColor;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 0 4px;
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .header {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 15px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .state {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .fold {
        margin-top: -12px;
      }
      :host([compact]) .fold.open {
        margin-top: 0;
      }
      :host([compact]) .progress {
        gap: 8px;
        padding: 12px;
      }
      :host([compact]) .where .pct {
        font-size: 18px;
      }
      :host([compact]) .rooms {
        gap: 6px;
      }
      :host([compact]) .chip {
        height: 30px;
        padding: 0 10px;
        font-size: 12px;
      }
      :host([compact]) .chip.on {
        padding-left: 6px;
      }
      :host([compact]) .actions {
        height: 40px;
      }
      :host([compact]) .act.pressed {
        border-radius: 20px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('vacuum.')) ?? 'vacuum.example';
    return { type: 'custom:m3e-vacuum-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'vacuum' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'battery_entity', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        listOf(
          'rooms',
          {
            name: field.text('部屋の名前', true),
            segment: field.text('部屋の ID（セグメント番号）'),
            area: field.number('広さ（m²）', { min: 0 }),
            selected: field.boolean('最初から選ぶ'),
          },
          'name',
          'segment',
        ),
        { name: 'room_service', selector: { text: {} } },
        { name: 'show_fan_speed', default: true, selector: { boolean: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
    };
  }

  protected normalizeConfig(config: VacuumCardConfig): VacuumCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    return [
      c.entity,
      c.battery_entity,
      c.current_room_entity,
      c.progress_entity,
      c.remaining_entity,
      c.cleaned_area_entity,
      c.last_clean_entity,
      c.last_clean_duration_entity,
      c.filter_entity,
    ].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'teal';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 7;
  }

  private rooms(): Room[] {
    return this.config.rooms ?? [];
  }

  private battery(s: HassEntity | undefined): number | undefined {
    return numState(this.stateObj(this.config.battery_entity)) ?? (s?.attributes.battery_level as number | undefined);
  }

  private toggleRoom(name: string): void {
    this.pickedInit = true;
    const next = new Set(this.picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.picked = next;
  }

  /** Start: the picked rooms if any, else everywhere. */
  private start(): void {
    const s = this.stateObj(this.config.entity);
    if (s?.state === 'paused') {
      this.call('vacuum', 'start', {}, this.config.entity);
      return;
    }
    const rooms = this.rooms().filter((r) => this.picked.has(r.name));
    const segments = rooms.map((r) => r.segment).filter((v) => v !== undefined);
    if (!rooms.length || !segments.length) {
      this.call('vacuum', 'start', {}, this.config.entity);
      return;
    }
    const svc = this.config.room_service;
    if (svc?.startsWith('script.')) {
      this.call('script', 'turn_on', { variables: { segments, rooms: rooms.map((r) => r.name) } }, svc);
    } else if (svc) {
      const [domain, service] = svc.split('.');
      this.call(domain, service, { segments }, this.config.entity);
    } else {
      this.call('vacuum', 'send_command', { command: 'app_segment_clean', params: segments }, this.config.entity);
    }
  }

  /** Suction power: one chip per fan_speed_list entry. */
  private renderFanSpeed(off: boolean) {
    const s = this.stateObj(this.config.entity);
    const speeds = (s?.attributes.fan_speed_list as string[] | undefined) ?? [];
    if (this.config.show_fan_speed === false || !speeds.length || !(Number(s?.attributes.supported_features ?? 0) & FAN_SPEED)) return nothing;
    const current = s?.attributes.fan_speed as string | undefined;
    return html`<div class="rooms" data-accent=${this.config.color ?? 'teal'}>
      <div class="label"><span>吸引力</span><span>${current ? (FAN_SPEED_LABEL[current.toLowerCase()] ?? current) : ''}</span></div>
      <div class="chips" role="radiogroup" aria-label="吸引力">
        ${speeds.map((sp) => {
          const on = sp === current;
          return html`<button
            class="icon-btn chip ${on ? 'on' : ''}"
            role="radio"
            aria-checked=${on ? 'true' : 'false'}
            ?disabled=${off}
            @click=${() => this.call('vacuum', 'set_fan_speed', { fan_speed: sp }, this.config.entity)}
          >
            ${on ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}${FAN_SPEED_LABEL[sp.toLowerCase()] ?? sp}
          </button>`;
        })}
      </div>
    </div>`;
  }

  private act(key: string, label: string, icon: unknown, onClick: () => void, opts: { primary?: boolean; disabled?: boolean } = {}) {
    return html`<button
      class="icon-btn act ${opts.primary ? 'primary' : ''} ${this.pressed === key ? 'pressed' : ''}"
      ?disabled=${opts.disabled}
      @click=${onClick}
      @pointerdown=${() => (this.pressed = key)}
      @pointerup=${() => (this.pressed = '')}
      @pointerleave=${() => (this.pressed = '')}
      @pointercancel=${() => (this.pressed = '')}
    >
      ${icon}${label}
    </button>`;
  }

  protected renderCard() {
    const c = this.config;
    const s = this.stateObj(c.entity);
    const st = s?.state ?? 'unavailable';
    const off = isUnavailable(s);
    const running = RUNNING.has(st);
    const room = this.stateObj(c.current_room_entity)?.state;
    const name = c.name ?? (s?.attributes.friendly_name as string) ?? c.entity;
    const bat = this.battery(s);
    const pct = numState(this.stateObj(c.progress_entity));
    const rem = numState(this.stateObj(c.remaining_entity));
    const area = numState(this.stateObj(c.cleaned_area_entity));
    const rooms = this.rooms();
    const pickedRooms = rooms.filter((r) => this.picked.has(r.name));
    const totalArea = pickedRooms.reduce((a, r) => a + (r.area ?? 0), 0);
    const idx = room ? pickedRooms.findIndex((r) => r.name === room) : -1;
    const next = idx >= 0 ? pickedRooms[idx + 1]?.name : undefined;
    const statusLine = [STATE_LABEL[st] ?? st, st === 'cleaning' && room ? room : ''].filter(Boolean).join('・');
    const lastT = Date.parse(this.stateObj(c.last_clean_entity)?.state ?? '');
    const lastDur = duration(this.stateObj(c.last_clean_duration_entity));
    const filter = this.stateObj(c.filter_entity);
    const filterText = filter
      ? String(filter.attributes.unit_of_measurement) === '%'
        ? `${Math.round(numState(filter) ?? 0)}%`
        : `残り ${duration(filter)}`
      : '';
    return html`<div class="card ${off ? 'unavailable' : ''}" data-accent=${running || st === 'paused' ? nothing : 'neutral'}>
      <div class="header" @click=${() => this.tapEntity(c.entity)}>
        <m3e-shape .shape=${running || st === 'paused' ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?spin=${st === 'cleaning'}>
          <m3e-icon icon="robot-vacuum"></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="name">${name}</p>
          <p class="state">${statusLine}</p>
        </div>
        ${bat !== undefined
          ? html`<span class="battery ${bat <= 20 ? 'low' : ''}"><m3e-icon icon="battery-full"></m3e-icon>${Math.round(bat)}%</span>`
          : nothing}
        ${Number(s?.attributes.supported_features ?? 0) & LOCATE
          ? html`<button
              class="icon-btn locate"
              aria-label="場所を音で知らせる"
              title="場所を音で知らせる"
              ?disabled=${off}
              @click=${(e: Event) => {
                e.stopPropagation();
                this.call('vacuum', 'locate', {}, c.entity);
              }}
            >
              <m3e-icon icon="my-location"></m3e-icon>
            </button>`
          : nothing}
      </div>

      <div class="fold ${st === 'cleaning' || st === 'paused' ? 'open' : ''}" data-accent=${c.color ?? 'teal'}>
        <div>
          <div class="progress" role="status">
            <div class="row">
              <span class="where"
                >${room ? `${room}を掃除中` : st === 'paused' ? '一時停止中' : '掃除中'}${pct !== undefined
                  ? html`<span class="pct"><m3e-rolling-text .text=${`${Math.round(pct)}%`}></m3e-rolling-text></span>`
                  : nothing}</span
              >
              ${rem !== undefined ? html`<span class="eta"><m3e-icon icon="timer"></m3e-icon>あと約${Math.round(rem)}分</span>` : nothing}
            </div>
            ${pct !== undefined ? html`<div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>` : nothing}
            ${area !== undefined || next
              ? html`<div class="meta">
                  <span>${area !== undefined ? html`${Math.round(area)}${totalArea ? ` / ${totalArea}` : ''} m²` : ''}</span>
                  <span>${next ? `次は${next}` : ''}</span>
                </div>`
              : nothing}
          </div>
        </div>
      </div>

      ${rooms.length
        ? html`<div class="rooms" data-accent=${c.color ?? 'teal'}>
            <div class="label"><span>掃除する部屋</span><span>${pickedRooms.length ? `${pickedRooms.length}部屋を選択` : 'すべての部屋'}</span></div>
            <div class="chips" role="group" aria-label="掃除する部屋">
              ${repeat(
                rooms,
                (r) => r.name,
                (r) => {
                  const on = this.picked.has(r.name);
                  return html`<button
                    class="icon-btn chip ${on ? 'on' : ''}"
                    aria-pressed=${on ? 'true' : 'false'}
                    @click=${() => this.toggleRoom(r.name)}
                  >
                    ${on ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}${r.name}
                  </button>`;
                },
              )}
            </div>
          </div>`
        : nothing}

      ${this.renderFanSpeed(off)}

      <div class="actions" data-accent=${c.color ?? 'teal'}>
        ${st === 'cleaning'
          ? this.act('main', '一時停止', html`<m3e-icon icon="pause"></m3e-icon>`, () => this.call('vacuum', 'pause', {}, c.entity), { primary: true })
          : this.act(
              'main',
              st === 'paused' ? '再開' : pickedRooms.length ? `${pickedRooms.length}部屋を掃除` : '掃除を始める',
              html`<m3e-icon icon="play-arrow"></m3e-icon>`,
              () => this.start(),
              { primary: true, disabled: off },
            )}
        ${this.act('stop', '停止', html`<span class="stop-glyph"></span>`, () => this.call('vacuum', 'stop', {}, c.entity), {
          disabled: off || !(running || st === 'paused'),
        })}
        ${this.act('dock', '充電台へ', html`<m3e-icon icon="home"></m3e-icon>`, () => this.call('vacuum', 'return_to_base', {}, c.entity), {
          disabled: off || st === 'docked' || st === 'returning',
        })}
      </div>

      ${Number.isFinite(lastT) || filterText
        ? html`<div class="foot">
            <span>${Number.isFinite(lastT) ? `前回：${dayWord(lastT)} ${hhmm(lastT)}${lastDur ? `・${lastDur}` : ''}` : ''}</span>
            <span>${filterText ? `${c.filter_name ?? 'フィルター寿命'} ${filterText}` : ''}</span>
          </div>`
        : nothing}
    </div>`;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.pickedInit && this.config.rooms) {
      const preset = this.config.rooms.filter((r) => r.selected).map((r) => r.name);
      if (preset.length) this.picked = new Set(preset);
      this.pickedInit = true;
    }
  }
}

define('m3e-vacuum-card', M3eVacuumCard);
