import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, actionsSection, TAP_ACTION_FIELD, type BaseCardConfig } from './base-card';
import { field, listOf, objectOf } from '../editor/form-helpers';
import { debounce, domainOf, isActive, isUnavailable, numState } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-rolling-text';
import '../components/m3e-wavy-progress';

interface TempItem {
  /** water_heater (target temperature) or number / input_number. */
  entity: string;
  name?: string;
  icon?: string;
}

interface ModeItem {
  /** switch / input_boolean (toggled), button / input_button / script (pressed). */
  entity: string;
  name?: string;
  icon?: string;
}

interface UsageItem {
  entity: string;
  name?: string;
}

export interface WaterHeaterCardConfig extends BaseCardConfig {
  /** The water heater: name, running state, header. */
  entity: string;
  name?: string;
  icon?: string;
  /** binary_sensor that is on while the burner / heat pump is running → chip. */
  burning_entity?: string;
  burning_text?: string;
  /** Temperature tiles with ▲▼. Default: the water heater itself as 給湯. */
  temperatures?: TempItem[];
  /** Bath filling progress (0–100 %). The panel shows while it is between 0 and 100. */
  fill?: { entity: string; remaining_entity?: string; label?: string; active_entity?: string };
  /** Buttons along the bottom: ふろ自動, 追いだき, 保温… */
  modes?: ModeItem[];
  /** Today's usage, e.g. gas and water meters. */
  usage?: UsageItem[];
  usage_label?: string;
}

const RUNNING_OFF = new Set(['off', 'unavailable', 'unknown']);

function target(s: HassEntity | undefined): number | undefined {
  if (!s) return undefined;
  return domainOf(s.entity_id) === 'water_heater' ? (s.attributes.temperature as number | undefined) : numState(s);
}

function limits(s: HassEntity | undefined): { min: number; max: number; step: number } {
  const a = s?.attributes ?? {};
  if (s && domainOf(s.entity_id) === 'water_heater') {
    return { min: a.min_temp ?? 30, max: a.max_temp ?? 60, step: a.target_temp_step ?? 1 };
  }
  return { min: a.min ?? 30, max: a.max ?? 60, step: a.step ?? 1 };
}

const tempIcon = (i: number) => (i === 0 ? 'shower' : 'hot-tub');

/**
 * Water heater / bath controller (Japanese gas or heat-pump systems):
 * header with a burner chip, temperature tiles with ▲▼, the bath-filling
 * progress, mode buttons and today's gas / water usage.
 *
 * Motion: the header cookie turns slowly while the burner runs; temperatures
 * roll; the filling panel unfolds on the spatial spring and its water line
 * flows as a wavy progress; mode buttons widen and round while pressed and
 * re-tint on the effects spring.
 */
export class M3eWaterHeaterCard extends M3eBaseCard<WaterHeaterCardConfig> {
  @state() private pending: Record<string, number> = {};
  private senders = new Map<string, ReturnType<typeof debounce<[number]>>>();
  @state() private pressedMode = '';

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
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      .state {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px 4px 8px;
        border-radius: 14px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 13px / 18px var(--m3e-font-plain);
        white-space: nowrap;
      }
      .chip m3e-icon {
        --m3e-icon-size: 16px;
      }
      .temps {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 8px;
      }
      .temp {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto 1fr;
        column-gap: 8px;
        padding: 12px 12px 12px 16px;
        border-radius: 24px;
        background: var(--m3-surface-high);
        min-height: 108px;
      }
      .temp .label {
        display: flex;
        align-items: center;
        gap: 6px;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        padding-top: 4px;
        cursor: pointer;
      }
      .temp .label m3e-icon {
        --m3e-icon-size: 18px;
      }
      .temp .value {
        align-self: center;
        font: 600 32px / 40px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .steps {
        grid-row: 1 / 3;
        grid-column: 2;
        align-self: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .steps .icon-btn {
        width: 36px;
        height: 28px;
        border-radius: 12px;
        background: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
        --m3e-icon-size: 20px;
      }
      .steps .icon-btn:active {
        border-radius: 14px;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .steps .icon-btn[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }

      /* filling panel: unfolds on the spatial spring */
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
      .fill {
        padding: 18px 20px 20px;
        border-radius: 28px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        display: flex;
        flex-direction: column;
        gap: 14px;
        --m3e-progress-active: var(--accent-fill);
        --m3e-progress-track: color-mix(in srgb, var(--accent-fill) 35%, var(--accent-container));
        --m3e-progress-handle: var(--accent-fill);
      }
      :host([theme='mocha']) .fill {
        --m3e-progress-active: var(--accent-on-container);
        --m3e-progress-track: color-mix(in srgb, var(--accent-on-container) 40%, var(--accent-container));
        --m3e-progress-handle: var(--accent-on-container);
      }
      .fill-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .fill-title {
        font: 600 15px / 22px var(--m3e-font-plain);
      }
      .fill-title .pct {
        margin-left: 6px;
        font: 600 22px / 26px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .remaining {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font: 400 13px / 18px var(--m3e-font-plain);
      }
      .remaining m3e-icon {
        --m3e-icon-size: 16px;
      }

      /* mode buttons */
      .modes {
        display: flex;
        gap: 4px;
        height: 48px;
      }
      .mode {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 8px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 14px / 1 var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          flex-grow var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .mode:first-child {
        border-radius: 24px 8px 8px 24px;
      }
      .mode:last-child {
        border-radius: 8px 24px 24px 8px;
      }
      .mode.on {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        border-radius: 24px;
      }
      .mode.pressed {
        flex-grow: 1.3;
        border-radius: 24px;
      }
      .mode m3e-icon {
        --m3e-icon-size: 20px;
      }
      .mode:active {
        transform: none;
      }
      .usage {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 4px 12px;
        padding: 0 4px;
      }
      .usage > span:first-child {
        flex: none;
        white-space: nowrap;
      }
      .usage > span:last-child {
        min-width: 0;
        text-align: right;
      }
      /* Each reading keeps its name, figure and unit together when the line wraps. */
      .usage .item {
        white-space: nowrap;
      }
      .usage {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .usage b {
        font-weight: 500;
        color: var(--m3-on-surface);
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
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .state {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .chip {
        padding: 2px 10px 2px 6px;
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .temp {
        min-height: 80px;
        padding: 10px 10px 10px 14px;
        border-radius: 20px;
      }
      :host([compact]) .temp .label {
        font: 400 12px / 16px var(--m3e-font-plain);
        padding-top: 2px;
      }
      :host([compact]) .temp .value {
        font: 600 26px / 32px var(--m3e-font-brand);
      }
      :host([compact]) .steps .icon-btn {
        width: 32px;
        height: 26px;
      }
      :host([compact]) .fold {
        margin-top: -12px;
      }
      :host([compact]) .fold.open {
        margin-top: 0;
      }
      :host([compact]) .fill {
        padding: 12px 14px 14px;
        gap: 10px;
        border-radius: 22px;
      }
      :host([compact]) .fill-title {
        font: 600 14px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .fill-title .pct {
        font: 600 18px / 22px var(--m3e-font-brand);
      }
      :host([compact]) .modes {
        height: 40px;
      }
      :host([compact]) .mode {
        font: 500 13px / 1 var(--m3e-font-plain);
      }
      :host([compact]) .mode:first-child {
        border-radius: 20px 8px 8px 20px;
      }
      :host([compact]) .mode:last-child {
        border-radius: 8px 20px 20px 8px;
      }
      :host([compact]) .mode.on,
      :host([compact]) .mode.pressed {
        border-radius: 20px;
      }
      :host([compact]) .usage {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('water_heater.')) ?? 'water_heater.example';
    return { type: 'custom:m3e-water-heater-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'water_heater' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'burning_entity', selector: { entity: { domain: 'binary_sensor' } } },
        listOf(
          'temperatures',
          { entity: field.entity('給湯器・数値のエンティティ', { domain: ['water_heater', 'number', 'input_number'] }, true), name: field.text('名前'), icon: field.icon() },
          'name',
          'entity',
        ),
        objectOf('fill', {
          entity: field.entity('お湯はりの進み具合（%）', { domain: 'sensor' }, true),
          remaining_entity: field.entity('残り時間（分）', { domain: 'sensor' }),
          label: field.text('見出し'),
        }),
        listOf(
          'modes',
          {
            entity: field.entity('スイッチ・ボタン', { domain: ['switch', 'input_boolean', 'button', 'input_button', 'script'] }, true),
            name: field.text('名前'),
            icon: field.icon(),
          },
          'name',
          'entity',
        ),
        listOf('usage', { entity: field.entity('使用量のセンサー', { domain: 'sensor' }, true), name: field.text('名前') }, 'name', 'entity'),
        actionsSection(TAP_ACTION_FIELD),
      ],
    };
  }

  protected normalizeConfig(config: WaterHeaterCardConfig): WaterHeaterCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return config;
  }

  private temps(): TempItem[] {
    return this.config.temperatures ?? [{ entity: this.config.entity, name: '給湯' }];
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    return [
      c.entity,
      c.burning_entity,
      c.fill?.entity,
      c.fill?.remaining_entity,
      c.fill?.active_entity,
      ...this.temps().map((t) => t.entity),
      ...(c.modes ?? []).map((m) => m.entity),
      ...(c.usage ?? []).map((u) => u.entity),
    ].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'peach';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 6;
  }

  private shownTarget(item: TempItem): number | undefined {
    return this.pending[item.entity] ?? target(this.stateObj(item.entity));
  }

  private step(item: TempItem, dir: 1 | -1): void {
    const s = this.stateObj(item.entity);
    const cur = this.shownTarget(item);
    if (!s || cur === undefined) return;
    const { min, max, step } = limits(s);
    const next = Math.min(max, Math.max(min, +(cur + dir * step).toFixed(2)));
    if (next === cur) return;
    this.pending = { ...this.pending, [item.entity]: next };
    let send = this.senders.get(item.entity);
    if (!send) {
      send = debounce((t: number) => {
        const domain = domainOf(item.entity);
        if (domain === 'water_heater') this.call('water_heater', 'set_temperature', { temperature: t }, item.entity);
        else this.call(domain === 'input_number' ? 'input_number' : 'number', 'set_value', { value: t }, item.entity);
        setTimeout(() => {
          const { [item.entity]: _, ...rest } = this.pending;
          this.pending = rest;
        }, 1500);
      }, 600);
      this.senders.set(item.entity, send);
    }
    send(next);
  }

  private pressMode(item: ModeItem): void {
    const domain = domainOf(item.entity);
    if (domain === 'button' || domain === 'input_button') this.call(domain, 'press', {}, item.entity);
    else if (domain === 'script') this.call('script', 'turn_on', {}, item.entity);
    else {
      const s = this.stateObj(item.entity);
      this.call(domain === 'input_boolean' ? 'input_boolean' : 'homeassistant', isActive(s) ? 'turn_off' : 'turn_on', {}, item.entity);
    }
  }

  private fillState(): { active: boolean; pct?: number; remaining?: string } {
    const f = this.config.fill;
    if (!f) return { active: false };
    const pct = numState(this.stateObj(f.entity));
    const flag = f.active_entity ? isActive(this.stateObj(f.active_entity)) : undefined;
    const active = flag ?? (pct !== undefined && pct > 0 && pct < 100);
    const rem = this.stateObj(f.remaining_entity);
    const remN = numState(rem);
    const unit = String(rem?.attributes.unit_of_measurement ?? 'min');
    const minutes = remN === undefined ? undefined : Math.round(unit === 's' ? remN / 60 : unit === 'h' ? remN * 60 : remN);
    const remaining = minutes === undefined ? undefined : minutes >= 60 ? `あと約${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `あと約${minutes}分`;
    return { active, pct, remaining };
  }

  private renderTemp(item: TempItem, i: number) {
    const s = this.stateObj(item.entity);
    const v = this.shownTarget(item);
    const { min, max } = limits(s);
    const off = isUnavailable(s);
    const name = item.name ?? (s?.attributes.friendly_name as string) ?? item.entity;
    return html`<div class="temp ${off ? 'unavailable' : ''}">
      <span class="label" @click=${() => this.moreInfo(item.entity)}><m3e-icon .icon=${item.icon ?? tempIcon(i)}></m3e-icon>${name}</span>
      <div class="steps">
        <button class="icon-btn" aria-label="${name}を上げる" ?disabled=${off || v === undefined || v >= max} @click=${() => this.step(item, 1)}>
          <m3e-icon icon="keyboard-arrow-up"></m3e-icon>
        </button>
        <button class="icon-btn" aria-label="${name}を下げる" ?disabled=${off || v === undefined || v <= min} @click=${() => this.step(item, -1)}>
          <m3e-icon icon="keyboard-arrow-down"></m3e-icon>
        </button>
      </div>
      <span class="value" aria-live="polite"><m3e-rolling-text .text=${v === undefined ? '—' : `${v}°`}></m3e-rolling-text></span>
    </div>`;
  }

  protected renderCard() {
    const c = this.config;
    const s = this.stateObj(c.entity);
    const running = !!s && !RUNNING_OFF.has(s.state);
    const burning = isActive(this.stateObj(c.burning_entity));
    const activeModes = (c.modes ?? []).filter((m) => {
      const d = domainOf(m.entity);
      return d !== 'button' && d !== 'input_button' && isActive(this.stateObj(m.entity));
    });
    const modeName = (m: ModeItem) => m.name ?? (this.stateObj(m.entity)?.attributes.friendly_name as string) ?? m.entity;
    const statusLine = isUnavailable(s)
      ? '利用不可'
      : [running ? '運転中' : '停止中', ...activeModes.map(modeName)].join('・');
    const fill = this.fillState();
    const usage = (c.usage ?? [])
      .map((u) => {
        const us = this.stateObj(u.entity);
        if (!us) return undefined;
        const unit = ((us.attributes.unit_of_measurement as string) ?? '').replace('m3', 'm³');
        const n = Number(us.state);
        // 184.0 → 184, 0.82 stays: one number format across the cards.
        const v = us.state.trim() !== '' && Number.isFinite(n) ? String(+n.toFixed(2)) : us.state;
        return html`<span class="item">${u.name ?? us.attributes.friendly_name} <b>${v}</b> ${unit}</span>`;
      })
      .filter(Boolean);
    return html`<div class="card" data-accent=${running ? nothing : 'neutral'}>
      <div class="header" @click=${() => this.tapEntity(c.entity)}>
        <m3e-shape .shape=${running ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?spin=${burning}>
          <m3e-icon .icon=${c.icon ?? 'water-heater'}></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="name">${c.name ?? (s?.attributes.friendly_name as string) ?? c.entity}</p>
          <p class="state">${statusLine}</p>
        </div>
        ${burning
          ? html`<span class="chip" data-accent=${c.color ?? 'peach'}
              ><m3e-icon icon="local-fire-department"></m3e-icon>${c.burning_text ?? '燃焼中'}</span
            >`
          : nothing}
      </div>
      <div class="temps">${this.temps().map((t, i) => this.renderTemp(t, i))}</div>
      ${c.fill
        ? html`<div class="fold ${fill.active ? 'open' : ''}" ?inert=${!fill.active}>
            <div>
              <div class="fill" data-accent="sky" role="status">
                <div class="fill-top">
                  <span class="fill-title"
                    >${c.fill.label ?? 'お湯はり中'}<span class="pct"
                      ><m3e-rolling-text .text=${fill.pct !== undefined ? `${Math.round(fill.pct)}%` : ''}></m3e-rolling-text></span
                  ></span>
                  ${fill.remaining ? html`<span class="remaining"><m3e-icon icon="timer"></m3e-icon>${fill.remaining}</span>` : nothing}
                </div>
                <m3e-wavy-progress .value=${(fill.pct ?? 0) / 100} ?playing=${fill.active}></m3e-wavy-progress>
              </div>
            </div>
          </div>`
        : nothing}
      ${c.modes?.length
        ? html`<div class="modes" data-accent="sky">
            ${repeat(
              c.modes,
              (m) => m.entity,
              (m) => {
                const on = activeModes.includes(m);
                return html`<button
                  class="icon-btn mode ${on ? 'on' : ''} ${this.pressedMode === m.entity ? 'pressed' : ''}"
                  aria-pressed=${on ? 'true' : 'false'}
                  ?disabled=${isUnavailable(this.stateObj(m.entity))}
                  @click=${() => this.pressMode(m)}
                  @pointerdown=${() => (this.pressedMode = m.entity)}
                  @pointerup=${() => (this.pressedMode = '')}
                  @pointerleave=${() => (this.pressedMode = '')}
                  @pointercancel=${() => (this.pressedMode = '')}
                >
                  ${on ? html`<m3e-icon .icon=${m.icon ?? 'hot-tub'}></m3e-icon>` : nothing}${modeName(m)}
                </button>`;
              },
            )}
          </div>`
        : nothing}
      ${usage.length
        ? html`<div class="usage">
            <span>${c.usage_label ?? '今日の使用量'}</span>
            <span>${usage.map((u, i) => html`${i ? '・' : ''}${u}`)}</span>
          </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-water-heater-card', M3eWaterHeaterCard);
