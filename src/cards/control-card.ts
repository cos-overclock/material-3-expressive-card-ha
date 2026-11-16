import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { richCardStyles } from './shared-styles';
import { debounce, domainOf, isUnavailable } from '../ha/helpers';
import { displayPrecision } from '../ha/format';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-slider';
import '../components/m3e-button-group';
import '../components/m3e-rolling-text';

type ControlStyle = 'auto' | 'buttons' | 'chips' | 'slider';
const STYLES: ControlStyle[] = ['auto', 'buttons', 'chips', 'slider'];
const DOMAINS = ['select', 'input_select', 'number', 'input_number'];

export interface ControlCardConfig extends BaseCardConfig {
  /** select / input_select (options) or number / input_number (a value in a range). */
  entity: string;
  name?: string;
  icon?: string;
  /** card (default): header and the control under it. row: one row (56px) for listing. */
  layout?: 'card' | 'row';
  /**
   * select: buttons (one row) or chips (wrapping). number: slider or buttons (−/+).
   * auto (default): buttons for up to 4 options, chips beyond; for numbers the
   * entity's own mode (box → −/+, else a slider).
   */
  control?: ControlStyle;
  /** Override option labels: { away: 外出 } */
  labels?: Record<string, string>;
  unit?: string;
}

/**
 * Pick an option (select / input_select) or set a value (number /
 * input_number): house modes, scene modes, volumes, thresholds…
 *
 * Motion: buttons widen while pressed; chips round and gain a check when
 * picked; the value rolls up or down; the slider follows the finger and
 * sends on release.
 */
export class M3eControlCard extends M3eBaseCard<ControlCardConfig> {
  /** Number value while dragging / stepping, until HA reports it. */
  @state() private pending?: number;
  private clearPending?: ReturnType<typeof setTimeout>;

  private sendNumber = debounce((v: number) => {
    this.call(domainOf(this.config.entity), 'set_value', { value: v }, this.config.entity);
    clearTimeout(this.clearPending);
    this.clearPending = setTimeout(() => (this.pending = undefined), 1500);
  }, 400);

  static override styles = [
    M3eBaseCard.styles,
    richCardStyles,
    css`
      .options {
        --m3e-group-height: 44px;
      }
      .number {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .number .big {
        flex: 1;
        text-align: center;
      }
      .unit {
        font: 500 20px / 1 var(--m3e-font-brand);
        margin-left: 2px;
        color: var(--m3-on-surface-variant);
      }
      .value-pill {
        font: 600 18px / 24px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        color: var(--accent-fill);
        white-space: nowrap;
      }

      /* row: 56px, name and value with a small control on the right */
      .card.row {
        height: 100%;
        min-height: 56px;
        padding: 6px 8px 6px 8px;
        flex-direction: row;
        align-items: center;
        gap: 10px;
      }
      .row .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .row .state {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      .mini-step {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        --m3e-icon-size: 20px;
      }
      .mini-step:active {
        border-radius: 20px;
      }
      .row .value-pill {
        min-width: 3ch;
        text-align: center;
        font-size: 15px;
      }
      :host([compact]) .options {
        --m3e-group-height: 40px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => DOMAINS.includes(domainOf(id))) ?? 'input_select.example';
    return { type: 'custom:m3e-control-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: DOMAINS } } },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'card', label: 'カード（既定）' },
                { value: 'row', label: '1行' },
              ],
            },
          },
        },
        {
          name: 'control',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'auto', label: '自動' },
                { value: 'buttons', label: 'ボタン（選択肢 / −・＋）' },
                { value: 'chips', label: 'チップ（選択肢が多いとき）' },
                { value: 'slider', label: 'スライダー（数値）' },
              ],
            },
          },
        },
        { name: 'unit', selector: { text: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) => ({ control: '操作部' })[s.name],
    };
  }

  protected normalizeConfig(config: ControlCardConfig): ControlCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (!DOMAINS.includes(domainOf(config.entity))) throw new Error(`entity must be one of: ${DOMAINS.join(', ')}`);
    if (config.control && !STYLES.includes(config.control)) throw new Error(`control must be one of: ${STYLES.join(', ')}`);
    if (config.layout && !['card', 'row'].includes(config.layout)) throw new Error('layout must be card or row');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.config.layout === 'row' ? { columns: 12, rows: 1, min_columns: 6 } : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.config.layout === 'row' ? 1 : 3;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.clearPending);
  }

  private get isSelect(): boolean {
    return domainOf(this.config.entity).endsWith('select');
  }

  private label(option: string): string {
    return this.config.labels?.[option] ?? option;
  }

  private select(option: string): void {
    this.call(domainOf(this.config.entity), 'select_option', { option }, this.config.entity);
  }

  private range(s: HassEntity) {
    const a = s.attributes;
    const min = Number(a.min ?? 0);
    const max = Number(a.max ?? 100);
    const step = Number(a.step ?? 1) || 1;
    return { min, max, step };
  }

  private value(s: HassEntity): number | undefined {
    if (this.pending !== undefined) return this.pending;
    const n = Number(s.state);
    return s.state !== '' && Number.isFinite(n) ? n : undefined;
  }

  private format(s: HassEntity, v: number | undefined): string {
    if (v === undefined) return '—';
    const { step } = this.range(s);
    const decimals = displayPrecision(s, this.hass) ?? (String(step).split('.')[1]?.length ?? 0);
    return v.toFixed(decimals);
  }

  private unit(s: HassEntity): string {
    return this.config.unit ?? (s.attributes.unit_of_measurement as string | undefined) ?? '';
  }

  private nudge(s: HassEntity, dir: 1 | -1): void {
    const { min, max, step } = this.range(s);
    const cur = this.value(s) ?? min;
    const next = Math.min(max, Math.max(min, Math.round((cur + dir * step) / step) * step));
    this.pending = +next.toFixed(6);
    this.sendNumber(this.pending);
  }

  /** The control style in effect for this entity. */
  private controlStyle(s: HassEntity): Exclude<ControlStyle, 'auto'> {
    const c = this.config.control ?? 'auto';
    if (this.isSelect) {
      if (c === 'buttons' || c === 'chips') return c;
      return ((s.attributes.options as string[] | undefined) ?? []).length <= 4 ? 'buttons' : 'chips';
    }
    if (c === 'buttons' || c === 'slider') return c;
    return s.attributes.mode === 'box' ? 'buttons' : 'slider';
  }

  private renderSelect(s: HassEntity, off: boolean) {
    const options = (s.attributes.options as string[] | undefined) ?? [];
    if (this.controlStyle(s) === 'buttons') {
      return html`<m3e-button-group
        class="options"
        label=${this.config.name ?? (s.attributes.friendly_name as string) ?? ''}
        .options=${options.map((o) => ({ value: o, label: this.label(o) }))}
        .value=${s.state}
        ?disabled=${off}
        @select=${(e: CustomEvent<{ value: string }>) => this.select(e.detail.value)}
      ></m3e-button-group>`;
    }
    return html`<div class="chips" role="radiogroup">
      ${options.map(
        (o) => html`<button class="chip ${o === s.state ? 'on' : ''}" role="radio" aria-checked=${o === s.state ? 'true' : 'false'} ?disabled=${off} @click=${() => this.select(o)}>
          ${o === s.state ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}<span>${this.label(o)}</span>
        </button>`,
      )}
    </div>`;
  }

  private renderNumber(s: HassEntity, off: boolean) {
    const { min, max, step } = this.range(s);
    const v = this.value(s);
    const unit = this.unit(s);
    if (this.controlStyle(s) === 'buttons') {
      return html`<div class="number">
        <button class="icon-btn step" aria-label="下げる" ?disabled=${off || (v ?? min) <= min} @click=${() => this.nudge(s, -1)}>
          <m3e-icon icon="remove"></m3e-icon>
        </button>
        <span class="big"><m3e-rolling-text .text=${this.format(s, v)}></m3e-rolling-text>${unit ? html`<span class="unit">${unit}</span>` : nothing}</span>
        <button class="icon-btn step plus" aria-label="上げる" ?disabled=${off || (v ?? max) >= max} @click=${() => this.nudge(s, 1)}>
          <m3e-icon icon="add"></m3e-icon>
        </button>
      </div>`;
    }
    return html`<m3e-slider
      label=${this.config.name ?? (s.attributes.friendly_name as string) ?? ''}
      .value=${v ?? min}
      .min=${min}
      .max=${max}
      .step=${step}
      ?disabled=${off}
      @input=${(e: CustomEvent<{ value: number }>) => (this.pending = e.detail.value)}
      @change=${(e: CustomEvent<{ value: number }>) => {
        this.pending = e.detail.value;
        this.sendNumber(e.detail.value);
      }}
    ></m3e-slider>`;
  }

  private renderRow(s: HassEntity, name: string, icon: string, off: boolean) {
    const v = this.isSelect ? undefined : this.value(s);
    return html`<div class="card row ${off ? 'unavailable' : ''}">
      <div class="header" style="flex:1;min-width:0">
        <div class="tap" @click=${() => this.tapEntity(this.config.entity)}>
          <m3e-shape shape="cookie9" size=${this.compact ? 36 : 40}><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${this.isSelect ? this.label(s.state) : `${this.format(s, v)}${this.unit(s) ? ` ${this.unit(s)}` : ''}`}</p>
          </div>
        </div>
      </div>
      ${this.isSelect
        ? html`<button class="icon-btn mini-step" aria-label="選択肢を開く" ?disabled=${off} @click=${() => this.moreInfo(this.config.entity)}>
            <m3e-icon icon="keyboard-arrow-down"></m3e-icon>
          </button>`
        : html`<button class="icon-btn mini-step" aria-label="下げる" ?disabled=${off} @click=${() => this.nudge(s, -1)}><m3e-icon icon="remove"></m3e-icon></button>
            <button class="icon-btn mini-step" aria-label="上げる" ?disabled=${off} @click=${() => this.nudge(s, 1)}><m3e-icon icon="add"></m3e-icon></button>`}
    </div>`;
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    if (!s) return html`<div class="card unavailable"></div>`;
    const off = isUnavailable(s);
    const name = this.config.name ?? (s.attributes.friendly_name as string | undefined) ?? this.config.entity;
    const icon = this.config.icon ?? (this.isSelect ? 'list' : 'tune');
    if (this.config.layout === 'row') return this.renderRow(s, name, icon, off);
    const v = this.isSelect ? undefined : this.value(s);
    const showsValue = this.isSelect ? this.controlStyle(s) === 'chips' : this.controlStyle(s) === 'slider';
    return html`<div class="card ${off ? 'unavailable' : ''}">
      <div class="header">
        <div class="tap" @click=${() => this.tapEntity(this.config.entity)}>
          <m3e-shape shape="cookie9" size=${this.compact ? 36 : 44}><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
          <div class="text">
            <p class="name">${name}</p>
            <p class="state">${off ? '利用不可' : this.isSelect ? this.label(s.state) : `${this.format(s, v)}${this.unit(s) ? ` ${this.unit(s)}` : ''}`}</p>
          </div>
        </div>
        ${showsValue && !this.isSelect ? html`<span class="value-pill">${this.format(s, v)}${this.unit(s)}</span>` : nothing}
      </div>
      ${this.isSelect ? this.renderSelect(s, off) : this.renderNumber(s, off)}
    </div>`;
  }
}

define('m3e-control-card', M3eControlCard);
