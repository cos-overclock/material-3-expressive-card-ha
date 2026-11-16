import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, actionsSection, TAP_ACTION_FIELD, type BaseCardConfig } from './base-card';
import { debounce, domainOf, isUnavailable } from '../ha/helpers';
import { FAN_LABEL, HVAC_LABEL, SWING_LABEL, label } from '../ha/labels';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import type { GroupOption } from '../components/m3e-button-group';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-button-group';
import '../components/m3e-rolling-text';
import '../components/m3e-switch';
import '../components/m3e-slider';

interface VaneOption {
  mode: string;
  label?: string;
  /** Draw an air-vane at this angle instead of a label (0 = horizontal, 90 = down). */
  angle?: number;
}

/** How a fan speed / vane row is set: auto picks a slider when the buttons don't fit. */
export type ControlStyle = 'auto' | 'buttons' | 'slider';

/** HA's standard preset_modes in Japanese; others show as reported. */
const PRESET_LABEL: Record<string, string> = {
  none: 'なし',
  eco: 'エコ',
  away: '外出',
  boost: 'パワフル',
  comfort: '快適',
  home: '在宅',
  sleep: 'おやすみ',
  activity: '活動',
};

const PRESET_ICON: Record<string, string> = {
  eco: 'eco',
  away: 'flight',
  boost: 'rocket-launch',
  comfort: 'chair',
  home: 'home',
  sleep: 'bedtime',
  activity: 'directions-walk',
};

export interface ClimateCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  /** Room humidity sensor when the climate entity has no current_humidity. */
  humidity_entity?: string;
  /** Start with the fan / vane panel open. Default false (design: closed). */
  expanded?: boolean;
  /** Show the fan speed / vane panel. Default true. false hides it whatever the per-row options say. */
  show_fan_panel?: boolean;
  /** Show the fan speed row (fan_modes). Default true. */
  show_fan_mode?: boolean;
  /** Show the vertical vane row (swing_modes). Default true. */
  show_swing_mode?: boolean;
  /** Show the horizontal vane row (swing_horizontal_modes). Default true. */
  show_swing_horizontal_mode?: boolean;
  /**
   * Entities that set the fan speed / vanes instead of the climate entity's
   * fan_modes / swing_modes / swing_horizontal_modes: select, input_select,
   * number or input_number.
   */
  fan_mode_entity?: string;
  swing_mode_entity?: string;
  swing_horizontal_mode_entity?: string;
  /**
   * Auto / manual switch per row: switch or input_boolean (on = auto), or a
   * select / input_select with an auto option (auto, オート, 自動).
   */
  fan_auto_entity?: string;
  swing_auto_entity?: string;
  swing_horizontal_auto_entity?: string;
  /**
   * Buttons or a slider per row. Default auto: buttons, or a slider when the
   * buttons don't fit the card's width (or a number entity has too many steps).
   */
  fan_control?: ControlStyle;
  swing_control?: ControlStyle;
  swing_horizontal_control?: ControlStyle;
  /** Override labels: { fan: {...}, swing: {...}, hvac: {...}, preset: {...} } */
  labels?: { fan?: Record<string, string>; swing?: Record<string, string>; hvac?: Record<string, string>; preset?: Record<string, string> };
  /** Preset buttons (preset_modes: eco, sleep, boost…). Default true; shown only when the entity has presets. */
  show_presets?: boolean;
  /** Explicit vertical vane buttons, e.g. [{mode: swing, label: スイング}, {mode: '1', angle: 0}, …] */
  vertical_vanes?: VaneOption[];
}

const MODE_ACCENT: Record<string, Accent | 'neutral'> = {
  heat: 'peach',
  cool: 'blue',
  dry: 'teal',
  fan_only: 'green',
  auto: 'lavender',
  heat_cool: 'lavender',
  off: 'neutral',
};

const MODE_ICON: Record<string, string> = {
  heat: 'local-fire-department',
  cool: 'ac-unit',
  dry: 'water-drop',
  fan_only: 'mode-fan',
  auto: 'thermostat',
  heat_cool: 'thermostat',
  off: 'power-settings-new',
};

const ACTION_LABEL: Record<string, string> = {
  heating: '暖房中',
  preheating: '予熱中',
  cooling: '冷房中',
  drying: '除湿中',
  fan: '送風中',
  idle: '待機中',
  defrosting: '霜取り中',
  off: '停止中',
};

const MODE_RUNNING: Record<string, string> = {
  heat: '暖房中',
  cool: '冷房中',
  dry: '除湿中',
  fan_only: '送風中',
  auto: '自動運転中',
  heat_cool: '自動運転中',
  off: '停止中',
};

const VANE_POSITIONS = ['highest', 'high', 'middle', 'mid', 'low', 'lowest', 'up', 'down'];
const SWING_WORDS = new Set(['on', 'swing', 'both', 'vertical', 'auto']);

/** Domains a fan speed / vane row can be set through instead of the climate entity. */
const MODE_DOMAINS = ['select', 'input_select', 'number', 'input_number'];
/** Domains an auto / manual switch can be. */
const AUTO_DOMAINS = ['switch', 'input_boolean', 'select', 'input_select'];
const AUTO_WORD = /^(auto|automatic|オート|自動)$/i;
const MANUAL_WORD = /^(manual|マニュアル|手動)$/i;
/** A number / input_number row gets buttons only up to this many steps. */
const MAX_NUMBER_STEPS = 12;

const CONTROL_STYLES: ControlStyle[] = ['auto', 'buttons', 'slider'];
/**
 * Options that aren't a step on the speed / vane scale. A slider row shows
 * them as buttons beside the slider.
 */
const SPECIAL_WORDS = new Set([
  'auto',
  'automatic',
  'on',
  'off',
  'swing',
  'both',
  'vertical',
  'horizontal',
  'wide',
  'stop',
  'オート',
  '自動',
  'スイング',
  '停止',
  '固定',
  'ワイド',
]);

const numStr = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** Rough rendered width of a 13px label: CJK glyphs are wider than Latin ones. */
const textWidth = (text = '') => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) >= 0x2e80 ? 13 : 7.5), 0);

type RowKey = 'fan' | 'swing' | 'swing_horizontal';
const ROW_KEYS: RowKey[] = ['fan', 'swing', 'swing_horizontal'];
const ROW_TITLE: Record<RowKey, string> = { fan: '風量', swing: '風向（上下）', swing_horizontal: '風向（左右）' };

/** Where a row reads its modes and current value from, and how it sets one. */
interface ModeSource {
  modes: string[];
  value?: string;
  /** number / input_number: the entity's own range, which a slider uses directly. */
  range?: { min: number; max: number; step: number; unit?: string };
  disabled: boolean;
  set: (value: string) => void;
}

/** A slider row: steps on a min–max scale, plus buttons for the options off the scale. */
interface SliderSpec {
  min: number;
  max: number;
  step: number;
  /** Current position, or undefined when the row is on an off-scale option. */
  value?: number;
  specials: GroupOption[];
  labelOf: (position: number) => string;
  valueOf: (position: number) => string;
}

interface AutoSwitch {
  on: boolean;
  disabled: boolean;
  set: (on: boolean) => void;
}

/** One fan speed / vane row of the folding panel. */
interface OptionRow {
  key: RowKey;
  title: string;
  value?: string;
  /** Display label of the current value. */
  current: string;
  options: GroupOption[];
  control: 'buttons' | 'slider';
  slider?: SliderSpec;
  disabled: boolean;
  set: (value: string) => void;
  auto?: AutoSwitch;
}

/**
 * Air conditioner card: mode-tinted header, big target temperature with −/+,
 * room chips, a mode button group and a folding fan / vane panel.
 *
 * Motion: the whole card re-tints on the effects spring when the mode changes;
 * the header shape morphs (cookie ⇄ circle when turning off); the target
 * temperature rolls up or down; −/+ round their corners while pressed; the
 * options panel unfolds on the spatial spring as its chevron flips.
 */
export class M3eClimateCard extends M3eBaseCard<ClimateCardConfig> {
  /** Coloured by its HVAC mode, so the editor has no accent swatches. */
  static override accentPicker = false;

  @state() private expanded = false;
  @state() private pendingTarget?: number;
  /** heat_cool: the low / high targets while −/+ are being pressed. */
  @state() private pendingRange?: { low: number; high: number };
  /** Slider positions while dragging, and until HA reports the new value. */
  @state() private live: Partial<Record<RowKey, number>> = {};
  /** Card width (8px steps), to decide whether a row's buttons fit. */
  @state() private width = 0;
  private resizeObserver?: ResizeObserver;

  private sendTarget = debounce((t: number) => {
    this.call('climate', 'set_temperature', { temperature: t }, this.config.entity);
    setTimeout(() => (this.pendingTarget = undefined), 1500);
  }, 700);

  private sendRange = debounce((r: { low: number; high: number }) => {
    this.call('climate', 'set_temperature', { target_temp_low: r.low, target_temp_high: r.high }, this.config.entity);
    setTimeout(() => (this.pendingRange = undefined), 1500);
  }, 700);

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
      }
      .header m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
        cursor: pointer;
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
        color: var(--accent-fill);
        transition: color var(--m3e-effects-default);
      }
      [data-accent='neutral'] .state {
        color: var(--m3-on-surface-variant);
      }
      .power {
        width: 44px;
        height: 44px;
        border-radius: 22px;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .power:active {
        border-radius: 12px;
      }
      [data-accent='neutral'] .power {
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .target {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .step {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        --m3e-icon-size: 28px;
      }
      .step:active {
        border-radius: 32px;
      }
      .minus {
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .plus {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      [data-accent='neutral'] .plus {
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
      }
      .step[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .value {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .temp {
        font: 600 64px / 68px var(--m3e-font-brand);
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
      }
      .temp-label {
        font: 500 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      /* heat_cool: low and high targets side by side, each with its own −/+. */
      .range {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .range .end {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 12px 8px;
        border-radius: 16px;
        background: var(--m3-surface-high);
      }
      .range .end[data-accent] {
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .range .temp {
        font: 600 44px / 48px var(--m3e-font-brand);
      }
      .range .temp-label {
        color: inherit;
        opacity: 0.8;
      }
      .range .steps {
        display: flex;
        gap: 8px;
      }
      .range .step {
        width: 48px;
        height: 40px;
        border-radius: 12px;
        background: var(--m3-surface-container);
        color: var(--m3-on-surface);
        --m3e-icon-size: 22px;
      }
      .range .step:active {
        border-radius: 20px;
      }
      .presets {
        --m3e-group-height: 40px;
      }
      .chips {
        display: flex;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px 4px 8px;
        border-radius: 8px;
        background: var(--m3-surface-high);
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      .chip m3e-icon {
        --m3e-icon-size: 18px;
        color: var(--m3-on-surface-variant);
      }
      .modes {
        --m3e-group-height: 48px;
      }
      .toggle {
        all: unset;
        box-sizing: border-box;
        height: 48px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }
      .toggle:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .toggle:active {
        border-radius: 24px;
      }
      .toggle m3e-icon {
        --m3e-icon-size: 20px;
        color: var(--m3-on-surface-variant);
      }
      .toggle .label {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .toggle .summary {
        flex: 1;
        text-align: right;
        font: 400 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chevron {
        transition: transform var(--m3e-spatial-default);
      }
      .open .chevron {
        transform: rotate(180deg);
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
      .panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 2px 2px;
        opacity: 0;
        transform: translateY(-8px);
        transition:
          opacity var(--m3e-effects-default),
          transform var(--m3e-spatial-default);
      }
      .fold.open .panel {
        opacity: 1;
        transform: none;
      }
      .group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .group-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 20px;
        font: 500 13px / 20px var(--m3e-font-plain);
      }
      .group-label .current {
        color: var(--accent-fill);
        transition: color var(--m3e-effects-default);
      }
      .auto-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--m3-on-surface-variant);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: color var(--m3e-effects-default);
        --m3e-switch-track: var(--accent-fill);
        --m3e-switch-handle: var(--accent-on-fill);
      }
      .auto-toggle.on {
        color: var(--accent-fill);
      }
      .auto-toggle.disabled {
        cursor: default;
      }
      .segments {
        --m3e-group-height: 44px;
      }
      /* Auto: nothing is selected; the buttons stay live and switch the row to manual. */
      .segments.auto {
        --m3e-group-fg: var(--m3-on-surface-variant);
      }
      .group-label .title {
        display: inline-flex;
        gap: 8px;
        min-width: 0;
      }
      .slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .slider-row.stacked {
        flex-direction: column;
        align-items: stretch;
      }
      .slider-row .specials {
        flex: none;
      }
      .slider-row m3e-slider {
        flex: 1;
        min-width: 0;
        --m3e-slider-height: 44px;
      }
      .slider-row.stacked m3e-slider {
        flex: none;
      }
      /* On auto or an off-scale option: the slider keeps its place but goes neutral. */
      m3e-slider.idle {
        --m3e-slider-active: var(--m3-surface-highest);
        --m3e-slider-inactive: var(--m3-surface-high);
        --m3e-slider-handle: var(--m3-on-surface-variant);
      }

      /* ---- compact density (phones and tablets) ---- */
      .chips[hidden] {
        display: none;
      }
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
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      :host([compact]) .power {
        width: 40px;
        height: 40px;
      }
      :host([compact]) .step {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        --m3e-icon-size: 24px;
      }
      :host([compact]) .step:active {
        border-radius: 26px;
      }
      :host([compact]) .temp {
        font: 600 48px / 52px var(--m3e-font-brand);
      }
      :host([compact]) .temp-label {
        font: 500 11px / 14px var(--m3e-font-plain);
      }
      :host([compact]) .range .temp {
        font: 600 36px / 40px var(--m3e-font-brand);
      }
      :host([compact]) .range .step {
        width: 44px;
        height: 36px;
      }
      :host([compact]) .presets {
        --m3e-group-height: 36px;
      }
      :host([compact]) .modes {
        --m3e-group-height: 40px;
      }
      :host([compact]) .toggle {
        height: 40px;
        padding: 0 12px;
      }
      :host([compact]) .toggle .label {
        font: 500 13px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .fold {
        margin-top: -12px;
      }
      :host([compact]) .fold.open {
        margin-top: 0;
      }
      :host([compact]) .panel {
        gap: 12px;
      }
      :host([compact]) .group {
        gap: 6px;
      }
      :host([compact]) .group-label {
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .segments {
        --m3e-group-height: 40px;
      }
      :host([compact]) .slider-row m3e-slider {
        --m3e-slider-height: 40px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('climate.')) ?? 'climate.example';
    return { type: 'custom:m3e-climate-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'humidity_entity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
        { name: 'show_fan_panel', default: true, selector: { boolean: {} } },
        { name: 'expanded', selector: { boolean: {} } },
        { name: 'show_presets', default: true, selector: { boolean: {} } },
        ...ROW_KEYS.map((k) => ({
          name: `${k}_section`,
          type: 'expandable',
          flatten: true,
          schema: [
            { name: `show_${k}_mode`, default: true, selector: { boolean: {} } },
            { name: `${k}_mode_entity`, selector: { entity: { domain: MODE_DOMAINS } } },
            { name: `${k}_auto_entity`, selector: { entity: { domain: AUTO_DOMAINS } } },
            {
              name: `${k}_control`,
              default: 'auto',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'auto', label: '自動（入りきらないときはスライダー）' },
                    { value: 'buttons', label: 'ボタン' },
                    { value: 'slider', label: 'スライダー' },
                  ],
                },
              },
            },
          ],
        })),
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) => {
        const m = /^(?:show_)?(fan|swing_horizontal|swing)_(section|mode|mode_entity|auto_entity|control)$/.exec(s.name);
        if (m) {
          const t = ROW_TITLE[m[1] as RowKey];
          return { section: t, mode: `${t}を表示`, mode_entity: `${t}の設定エンティティ`, auto_entity: `${t}のオート・マニュアル切り替え`, control: `${t}の操作部` }[m[2]];
        }
        return ({ show_fan_panel: '風量・風向を表示', expanded: '風量・風向を最初から開く', show_presets: 'プリセット（エコ・おやすみなど）を表示' } as Record<
          string,
          string
        >)[s.name];
      },
      computeHelper: (s: { name: string }) => {
        if (s.name.endsWith('_mode_entity')) return '省略するとエアコンのエンティティで設定します';
        if (s.name.endsWith('_auto_entity')) return 'スイッチはオンで自動。セレクトは auto・オート・自動 の選択肢を自動として扱います';
        return undefined;
      },
    };
  }

  protected normalizeConfig(config: ClimateCardConfig): ClimateCardConfig {
    if (!config.entity) throw new Error('entity is required');
    for (const k of ROW_KEYS) {
      const mode = config[`${k}_mode_entity`];
      const auto = config[`${k}_auto_entity`];
      if (mode && !MODE_DOMAINS.includes(domainOf(mode))) {
        throw new Error(`${k}_mode_entity must be one of: ${MODE_DOMAINS.join(', ')}`);
      }
      if (auto && !AUTO_DOMAINS.includes(domainOf(auto))) {
        throw new Error(`${k}_auto_entity must be one of: ${AUTO_DOMAINS.join(', ')}`);
      }
      const control = config[`${k}_control`];
      if (control && !CONTROL_STYLES.includes(control)) {
        throw new Error(`${k}_control must be one of: ${CONTROL_STYLES.join(', ')}`);
      }
    }
    this.expanded = !!config.expanded;
    return config;
  }

  protected watchedEntities(): string[] {
    const c = this.config;
    return [
      c.entity,
      c.humidity_entity,
      ...ROW_KEYS.flatMap((k) => [c[`${k}_mode_entity`], c[`${k}_auto_entity`]]),
    ].filter(Boolean) as string[];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver ??= new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width / 8) * 8;
      if (w !== this.width) this.width = w;
    });
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    const rows = this.rows().length;
    if (!rows) return 5;
    // Toggle row ≈ 1; each open row (label + buttons) ≈ 1.
    return this.expanded ? 6 + rows : 6;
  }

  private get attrs() {
    return this.stateObj(this.config.entity)?.attributes ?? {};
  }

  /** Target temperature step: the entity's, else 1 for °F and 0.5 for °C. */
  private get step(): number {
    return this.attrs.target_temp_step ?? (this.attrs.temperature_unit === '°F' ? 1 : 0.5);
  }

  private fmt(t: number | undefined): string {
    if (t == null || Number.isNaN(t)) return '—';
    return `${this.step < 1 ? t.toFixed(1) : Math.round(t)}°`;
  }

  private nudge(dir: 1 | -1): void {
    const a = this.attrs;
    const step = this.step;
    const cur = this.pendingTarget ?? a.temperature;
    if (cur == null) return;
    const next = Math.min(a.max_temp ?? 35, Math.max(a.min_temp ?? 7, Math.round((cur + dir * step) / step) * step));
    this.pendingTarget = next;
    this.sendTarget(next);
  }

  /** heat_cool: the entity reports a low and a high target instead of one temperature. */
  private isRange(): boolean {
    const a = this.attrs;
    return a.target_temp_low != null && a.target_temp_high != null && a.temperature == null;
  }

  /** Move the low or high end of the range one step, keeping at least one step between them. */
  private nudgeRange(end: 'low' | 'high', dir: 1 | -1): void {
    const a = this.attrs;
    const step = this.step;
    const cur = this.pendingRange ?? { low: Number(a.target_temp_low), high: Number(a.target_temp_high) };
    const min = a.min_temp ?? 7;
    const max = a.max_temp ?? 35;
    const snap = (t: number) => Math.round(t / step) * step;
    const next = { ...cur };
    if (end === 'low') next.low = Math.min(cur.high - step, Math.max(min, snap(cur.low + dir * step)));
    else next.high = Math.max(cur.low + step, Math.min(max, snap(cur.high + dir * step)));
    if (next.low === cur.low && next.high === cur.high) return;
    this.pendingRange = next;
    this.sendRange(next);
  }

  private setPreset(preset: string): void {
    this.call('climate', 'set_preset_mode', { preset_mode: preset }, this.config.entity);
  }

  private setMode(mode: string): void {
    this.call('climate', 'set_hvac_mode', { hvac_mode: mode }, this.config.entity);
  }

  private power(): void {
    const s = this.stateObj(this.config.entity);
    if (!s) return;
    this.call('climate', s.state === 'off' ? 'turn_on' : 'turn_off', {}, this.config.entity);
  }

  private stateLine(mode: string): string {
    const a = this.attrs;
    const running = a.hvac_action ? (ACTION_LABEL[a.hvac_action] ?? a.hvac_action) : (MODE_RUNNING[mode] ?? mode);
    if (mode === 'off') return '停止中';
    return a.current_temperature != null ? `${running}・室温 ${a.current_temperature}°` : running;
  }

  /** Compact cards drop the chip row, so the state line carries the room readings. */
  private compactStateLine(mode: string, humidity: unknown): string {
    const a = this.attrs;
    const running = mode === 'off' ? '停止中' : a.hvac_action ? (ACTION_LABEL[a.hvac_action] ?? a.hvac_action) : (MODE_RUNNING[mode] ?? mode);
    return [
      running,
      a.current_temperature != null ? `室温 ${a.current_temperature}°` : '',
      humidity != null && humidity !== '' && !Number.isNaN(Number(humidity)) ? `湿度 ${Math.round(Number(humidity))}%` : '',
    ]
      .filter(Boolean)
      .join('・');
  }

  private verticalOptions(modes: string[]): GroupOption[] {
    const L = this.config.labels?.swing;
    if (this.config.vertical_vanes) {
      return this.config.vertical_vanes.map((v) =>
        v.angle !== undefined
          ? { value: v.mode, vane: v.angle, ariaLabel: v.label ?? v.mode }
          : { value: v.mode, label: v.label ?? label(SWING_LABEL, v.mode, L), icon: 'air', iconWhenSelected: true, hug: true },
      );
    }
    const positional = modes.filter((m) => /^\d+$/.test(m) || VANE_POSITIONS.includes(m));
    return modes.map((m) => {
      const idx = positional.indexOf(m);
      if (idx >= 0 && positional.length > 1) {
        return { value: m, vane: (idx / (positional.length - 1)) * 90, ariaLabel: label(SWING_LABEL, m, L) };
      }
      return {
        value: m,
        label: label(SWING_LABEL, m, L),
        icon: SWING_WORDS.has(m) ? 'air' : undefined,
        iconWhenSelected: true,
        hug: positional.length > 1,
      };
    });
  }

  /** A row's modes from its setting entity, else from the climate entity's attributes. */
  private modeSource(entityId: string | undefined, list: string, attr: string, service: string): ModeSource {
    if (!entityId) {
      const a = this.attrs;
      return {
        modes: (a[list] as string[] | undefined) ?? [],
        value: a[attr],
        disabled: false,
        set: (v) => this.call('climate', service, { [attr]: v }, this.config.entity),
      };
    }
    const s = this.stateObj(entityId);
    const domain = domainOf(entityId);
    const disabled = isUnavailable(s);
    if (domain === 'number' || domain === 'input_number') {
      const a = s?.attributes ?? {};
      const min = Number(a.min);
      const max = Number(a.max);
      const step = Number(a.step) || 1;
      const count = Math.floor((max - min) / step + 1e-9) + 1;
      const value = Number(s?.state);
      const valid = Number.isFinite(min) && Number.isFinite(max) && max > min;
      return {
        modes: valid && count <= MAX_NUMBER_STEPS ? Array.from({ length: count }, (_, i) => numStr(min + i * step)) : [],
        value: !disabled && Number.isFinite(value) ? numStr(value) : undefined,
        range: valid ? { min, max, step, unit: a.unit_of_measurement } : undefined,
        disabled,
        set: (v) => this.call(domain, 'set_value', { value: Number(v) }, entityId),
      };
    }
    return {
      modes: (s?.attributes.options as string[] | undefined) ?? [],
      value: disabled ? undefined : s?.state,
      disabled,
      set: (v) => this.call(domain, 'select_option', { option: v }, entityId),
    };
  }

  /** A row's auto / manual switch: a switch / input_boolean (on = auto), or a select with an auto option. */
  private autoSwitch(entityId: string | undefined): AutoSwitch | undefined {
    if (!entityId) return undefined;
    const s = this.stateObj(entityId);
    const domain = domainOf(entityId);
    const disabled = isUnavailable(s);
    if (domain === 'select' || domain === 'input_select') {
      const options = (s?.attributes.options as string[] | undefined) ?? [];
      const auto = options.find((o) => AUTO_WORD.test(o));
      const manual = options.find((o) => MANUAL_WORD.test(o)) ?? options.find((o) => o !== auto);
      return {
        on: !!auto && s?.state === auto,
        disabled: disabled || !auto || !manual,
        set: (on) => {
          const option = on ? auto : manual;
          if (option) this.call(domain, 'select_option', { option }, entityId);
        },
      };
    }
    return {
      on: s?.state === 'on',
      disabled,
      set: (on) => this.call(domain, on ? 'turn_on' : 'turn_off', {}, entityId),
    };
  }

  /** The fan / vane rows the entities support and the config doesn't hide. */
  private rows(): OptionRow[] {
    const c = this.config;
    if (c.show_fan_panel === false) return [];
    const L = c.labels;
    const specs: Record<RowKey, { show?: boolean; list: string; attr: string; service: string; toOptions: (modes: string[]) => GroupOption[] }> = {
      fan: {
        show: c.show_fan_mode,
        list: 'fan_modes',
        attr: 'fan_mode',
        service: 'set_fan_mode',
        toOptions: (modes) => modes.map((m) => ({ value: m, label: label(FAN_LABEL, m, L?.fan) })),
      },
      swing: {
        show: c.show_swing_mode,
        list: 'swing_modes',
        attr: 'swing_mode',
        service: 'set_swing_mode',
        toOptions: (modes) => this.verticalOptions(modes),
      },
      swing_horizontal: {
        show: c.show_swing_horizontal_mode,
        list: 'swing_horizontal_modes',
        attr: 'swing_horizontal_mode',
        service: 'set_swing_horizontal_mode',
        toOptions: (modes) => modes.map((m) => ({ value: m, label: label(SWING_LABEL, m, L?.swing) })),
      },
    };
    const rows: OptionRow[] = [];
    for (const key of ROW_KEYS) {
      const spec = specs[key];
      if (spec.show === false) continue;
      const src = this.modeSource(c[`${key}_mode_entity`], spec.list, spec.attr, spec.service);
      const auto = this.autoSwitch(c[`${key}_auto_entity`]);
      if (!src.modes.length && !src.range && !auto) continue;
      const options = spec.toOptions(src.modes);
      const selected = options.find((o) => o.value === src.value);
      const slider = this.sliderSpec(src, options);
      const style = c[`${key}_control`] ?? 'auto';
      const control =
        slider && (style === 'slider' || !options.length || (style === 'auto' && !this.buttonsFit(options))) ? 'slider' : 'buttons';
      rows.push({
        key,
        title: ROW_TITLE[key],
        value: src.value,
        current:
          src.range && slider?.value !== undefined
            ? slider.labelOf(slider.value)
            : selected
              ? (selected.label ?? selected.ariaLabel ?? selected.value)
              : label(SWING_LABEL, src.value),
        options,
        control,
        slider,
        disabled: src.disabled,
        auto,
        // Picking a speed or vane while on auto switches the row to manual first.
        set: (v) => {
          if (auto?.on && !auto.disabled) auto.set(false);
          src.set(v);
        },
      });
    }
    return rows;
  }

  /** The slider for a row: a number entity's own range, else the options on the speed / vane scale. */
  private sliderSpec(src: ModeSource, options: GroupOption[]): SliderSpec | undefined {
    if (src.range) {
      const { min, max, step, unit } = src.range;
      const v = Number(src.value);
      return {
        min,
        max,
        step,
        value: src.value !== undefined && Number.isFinite(v) ? v : undefined,
        specials: [],
        labelOf: (x) => `${numStr(x)}${unit ?? ''}`,
        valueOf: (x) => numStr(x),
      };
    }
    const specials = options.filter((o) => SPECIAL_WORDS.has(o.value.toLowerCase()) || SPECIAL_WORDS.has(o.label ?? ''));
    const steps = options.filter((o) => !specials.includes(o));
    if (steps.length < 2) return undefined;
    const index = steps.findIndex((o) => o.value === src.value);
    const at = (x: number) => steps[Math.min(steps.length - 1, Math.max(0, Math.round(x)))];
    return {
      min: 0,
      max: steps.length - 1,
      step: 1,
      value: index >= 0 ? index : undefined,
      specials,
      labelOf: (x) => {
        const o = at(x);
        return o.label ?? o.ariaLabel ?? o.value;
      },
      valueOf: (x) => at(x).value,
    };
  }

  /** Whether a row's buttons fit the card's width (estimated from their labels). */
  private buttonsFit(options: GroupOption[]): boolean {
    if (!this.width) return options.length <= 7;
    const needed = options.reduce((w, o) => {
      const content = (o.vane !== undefined ? 18 : textWidth(o.label)) + (o.icon ? 22 : 0);
      return w + Math.max(36, content + (o.hug ? 20 : 16));
    }, 4 * (options.length - 1));
    // Card padding on both sides, plus the panel's 2px inset.
    return needed <= this.width - (this.compact ? 28 : 40) - 4;
  }

  private onSlide(r: OptionRow, spec: SliderSpec, e: CustomEvent<{ value: number }>): void {
    const v = e.detail.value;
    this.live = { ...this.live, [r.key]: v };
    if (e.type !== 'change') return;
    r.set(spec.valueOf(v));
    // Keep the dragged position until HA reports back, so the handle doesn't jump.
    setTimeout(() => {
      if (this.live[r.key] !== v) return;
      const { [r.key]: _drop, ...rest } = this.live;
      this.live = rest;
    }, 1500);
  }

  private renderSlider(r: OptionRow, spec: SliderSpec) {
    const live = this.live[r.key];
    const auto = !!r.auto?.on;
    const idle = live === undefined && (auto || spec.value === undefined);
    // More than two off-scale buttons go on their own line above the slider.
    const stacked = spec.specials.length > 2;
    const special = auto || live !== undefined || spec.value !== undefined ? '' : (r.value ?? '');
    return html`<div class="slider-row ${stacked ? 'stacked' : ''}">
      ${spec.specials.length
        ? html`<m3e-button-group
            class="segments specials ${auto ? 'auto' : ''}"
            label=${r.title}
            .options=${spec.specials.map((o) => ({ ...o, hug: !stacked }))}
            .value=${special}
            ?disabled=${r.disabled}
            @select=${(e: CustomEvent<{ value: string }>) => r.set(e.detail.value)}
          ></m3e-button-group>`
        : nothing}
      <m3e-slider
        class=${idle ? 'idle' : ''}
        label=${r.title}
        .min=${spec.min}
        .max=${spec.max}
        .step=${spec.step}
        .value=${live ?? spec.value ?? spec.min}
        ?disabled=${r.disabled}
        @input=${(e: CustomEvent<{ value: number }>) => this.onSlide(r, spec, e)}
        @change=${(e: CustomEvent<{ value: number }>) => this.onSlide(r, spec, e)}
      ></m3e-slider>
    </div>`;
  }

  private renderRow(r: OptionRow) {
    const auto = r.auto;
    const spec = r.control === 'slider' ? r.slider : undefined;
    const live = this.live[r.key];
    // A slider has no labels of its own, so its row always shows the value.
    const current = spec && live !== undefined ? spec.labelOf(live) : r.current;
    return html`<div class="group">
      <div class="group-label">
        <span class="title">
          <span>${r.title}</span>
          ${spec && auto && (!auto.on || live !== undefined) ? html`<span class="current">${current}</span>` : nothing}
        </span>
        ${auto
          ? html`<span
              class="auto-toggle ${auto.on ? 'on' : ''} ${auto.disabled ? 'disabled' : ''}"
              @click=${() => !auto.disabled && auto.set(!auto.on)}
            >
              自動
              <m3e-switch
                .checked=${auto.on}
                ?disabled=${auto.disabled}
                label="${r.title}を自動にする"
                @change=${(e: CustomEvent<{ checked: boolean }>) => auto.set(e.detail.checked)}
              ></m3e-switch>
            </span>`
          : html`<span class="current">${current}</span>`}
      </div>
      ${spec
        ? this.renderSlider(r, spec)
        : r.options.length
          ? html`<m3e-button-group
              class="segments ${auto?.on ? 'auto' : ''}"
              label=${r.title}
              .options=${r.options}
              .value=${auto?.on ? '' : (r.value ?? '')}
              ?disabled=${r.disabled}
              @select=${(e: CustomEvent<{ value: string }>) => r.set(e.detail.value)}
            ></m3e-button-group>`
          : nothing}
    </div>`;
  }

  /** heat_cool: 下限 (heating below) and 上限 (cooling above), each with −/+. */
  private renderRange(off: boolean) {
    const a = this.attrs;
    const r = this.pendingRange ?? { low: Number(a.target_temp_low), high: Number(a.target_temp_high) };
    const end = (key: 'low' | 'high', title: string, accent: string) => html`<div class="end" data-accent=${off ? nothing : accent}>
      <span class="temp-label">${title}</span>
      <span class="temp"><m3e-rolling-text .text=${this.fmt(r[key])}></m3e-rolling-text></span>
      <div class="steps">
        <button class="icon-btn step" aria-label="${title}を下げる" ?disabled=${off} @click=${() => this.nudgeRange(key, -1)}>
          <m3e-icon icon="remove"></m3e-icon>
        </button>
        <button class="icon-btn step" aria-label="${title}を上げる" ?disabled=${off} @click=${() => this.nudgeRange(key, 1)}>
          <m3e-icon icon="add"></m3e-icon>
        </button>
      </div>
    </div>`;
    return html`<div class="range">${end('low', '暖房（下限）', 'peach')}${end('high', '冷房（上限）', 'blue')}</div>`;
  }

  protected renderCard() {
    const s = this.stateObj(this.config.entity);
    const a = this.attrs;
    const mode = s?.state ?? 'off';
    const accent = MODE_ACCENT[mode] ?? 'lavender';
    const off = mode === 'off';
    const name = this.config.name ?? (a.friendly_name as string) ?? this.config.entity;
    const humidity = a.current_humidity ?? this.stateObj(this.config.humidity_entity)?.state;
    const modes = ((a.hvac_modes as string[]) ?? []).filter((m) => m !== 'off');
    const presets = (a.preset_modes as string[] | undefined) ?? [];
    const target = this.pendingTarget ?? a.temperature;
    const groups = this.rows();
    const hasFan = groups.some((g) => g.key === 'fan');
    const hasSwing = groups.some((g) => g.key !== 'fan');
    const panelTitle = hasFan && hasSwing ? '風量・風向' : hasFan ? '風量' : '風向';
    const summary = groups
      .map((g) => (g.auto?.on ? '自動' : g.current))
      .filter(Boolean)
      .join('・');

    return html`<div class="card ${isUnavailable(s) ? 'unavailable' : ''}" data-accent=${accent}>
      <div class="header">
        <m3e-shape
          .shape=${off ? 'circle' : 'cookie9'}
          size=${this.compact ? 36 : 44}
          @click=${() => this.tapEntity(this.config.entity)}
          aria-label="詳細"
        >
          <m3e-icon .icon=${MODE_ICON[mode] ?? 'thermostat'}></m3e-icon>
        </m3e-shape>
        <div class="text">
          <p class="name">${name}</p>
          <p class="state">${this.compact ? this.compactStateLine(mode, humidity) : this.stateLine(mode)}</p>
        </div>
        <button class="icon-btn power" aria-label=${off ? '運転' : '停止'} @click=${this.power}>
          <m3e-icon icon="power-settings-new"></m3e-icon>
        </button>
      </div>

      ${this.isRange() ? this.renderRange(off) : html`<div class="target">
        <button class="icon-btn step minus" aria-label="温度を下げる" ?disabled=${off || target == null} @click=${() => this.nudge(-1)}>
          <m3e-icon icon="remove"></m3e-icon>
        </button>
        <div class="value">
          <span class="temp"><m3e-rolling-text .text=${this.fmt(target)}></m3e-rolling-text></span>
          <span class="temp-label">設定温度</span>
        </div>
        <button class="icon-btn step plus" aria-label="温度を上げる" ?disabled=${off || target == null} @click=${() => this.nudge(1)}>
          <m3e-icon icon="add"></m3e-icon>
        </button>
      </div>`}

      <div class="chips" ?hidden=${this.compact}>
        ${a.current_temperature != null
          ? html`<span class="chip"><m3e-icon icon="thermostat"></m3e-icon>室温 ${a.current_temperature}°</span>`
          : nothing}
        ${humidity != null
          ? html`<span class="chip"><m3e-icon icon="humidity-percentage"></m3e-icon>湿度 ${Math.round(Number(humidity))}%</span>`
          : nothing}
      </div>

      ${modes.length
        ? html`<m3e-button-group
            class="modes"
            label="運転モード"
            .options=${modes.map((m) => ({
              value: m,
              label: label(HVAC_LABEL, m, this.config.labels?.hvac),
              icon: MODE_ICON[m],
              iconWhenSelected: true,
            }))}
            .value=${mode}
            @select=${(e: CustomEvent<{ value: string }>) => this.setMode(e.detail.value)}
          ></m3e-button-group>`
        : nothing}
      ${presets.length && this.config.show_presets !== false
        ? html`<m3e-button-group
            class="presets"
            label="プリセット"
            .options=${presets.map((p) => ({ value: p, label: label(PRESET_LABEL, p, this.config.labels?.preset), icon: PRESET_ICON[p], iconWhenSelected: true }))}
            .value=${a.preset_mode ?? ''}
            ?disabled=${off}
            @select=${(e: CustomEvent<{ value: string }>) => this.setPreset(e.detail.value)}
          ></m3e-button-group>`
        : nothing}
      ${groups.length
        ? html`<button
              class="toggle ${this.expanded ? 'open' : ''}"
              aria-expanded=${this.expanded ? 'true' : 'false'}
              @click=${() => (this.expanded = !this.expanded)}
            >
              <m3e-icon icon="mode-fan"></m3e-icon>
              <span class="label">${panelTitle}</span>
              <span class="summary">${summary}</span>
              <m3e-icon class="chevron" icon="keyboard-arrow-down"></m3e-icon>
            </button>
            <div class="fold ${this.expanded ? 'open' : ''}" ?inert=${!this.expanded}>
              <div>
                <div class="panel">${groups.map((g) => this.renderRow(g))}</div>
              </div>
            </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-climate-card', M3eClimateCard);
