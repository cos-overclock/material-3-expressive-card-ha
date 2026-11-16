import { css, html, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, PressGesture, press, type BaseCardConfig } from './base-card';
import { defaultIconFor } from '../ha/domain';
import { brightnessPct, isUnavailable } from '../ha/helpers';
import { hexToHs, hsToCss, hsToRgb, hueDistance, kelvinToCss, kelvinToUiRgb } from '../ha/color';
import type { LovelaceGridOptions } from '../ha/types';
import { ACCENT_OPTIONS, type Accent } from '../theme/tokens';
import { accentFromRgb } from '../theme/dynamic';
import { styleMap } from 'lit/directives/style-map.js';
import { define } from '../components/define';
import type { GroupOption } from '../components/m3e-button-group';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-switch';
import '../components/m3e-slider';
import '../components/m3e-button-group';
import '../components/m3e-rolling-text';

type LightLayout = 'slider' | 'color' | 'temperature' | 'full' | 'auto';
type LightTab = 'color' | 'temp';

const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

/** The layout that fits what a light can do. */
function layoutFor(supported: string[] | undefined): Exclude<LightLayout, 'auto'> {
  const modes = supported ?? [];
  const color = modes.some((m) => COLOR_MODES.includes(m));
  const temp = modes.includes('color_temp');
  if (color && temp) return 'full';
  if (color) return 'color';
  if (temp) return 'temperature';
  return 'slider';
}

interface ColorPreset {
  color: string;
  name?: string;
}
interface TempPreset {
  kelvin: number;
  name?: string;
}

export interface LightCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  icon?: string;
  /**
   * slider: one brightness bar · color: presets + brightness/hue/saturation ·
   * temperature: presets + brightness/kelvin · full: brightness + colour/white tabs ·
   * auto: picked from the light's supported_color_modes
   */
  layout?: LightLayout;
  presets?: ColorPreset[];
  temperature_presets?: TempPreset[];
  /** Show the brightness slider. Default true. */
  show_brightness?: boolean;
  /** Show the colour presets and the colour-temperature presets. Default true. */
  show_presets?: boolean;
  /** Show the hue, saturation and colour-temperature sliders. Default true. */
  show_color_sliders?: boolean;
}

const DEFAULT_COLOR_PRESETS: ColorPreset[] = [
  { color: '#FFC98A', name: '電球色' },
  { color: '#F4F1EA', name: '生成り' },
  { color: '#FF6FC4', name: 'ローズピンク' },
  { color: '#B98CFF', name: 'ラベンダー' },
  { color: '#7AA8FF', name: 'ブルー' },
  { color: '#7ADFA0', name: 'グリーン' },
];

const DEFAULT_TEMP_PRESETS: TempPreset[] = [
  { kelvin: 2700, name: '電球色' },
  { kelvin: 3500, name: '温白色' },
  { kelvin: 5000, name: '昼白色' },
  { kelvin: 6500, name: '昼光色' },
];

const SWATCH: Record<number, string> = { 2700: '#FFC98A', 3500: '#FFE2BD', 5000: '#FFF7EC', 6500: '#DCE7FF' };

const HUE_GRADIENT =
  'linear-gradient(90deg, #FF5C5C 0%, #FFD54A 17%, #5EDB7C 33%, #4FD6E8 50%, #5C7CFF 67%, #D35CFF 83%, #FF5C5C 100%)';
/** True for swatches light enough that a white glyph would disappear. */
function isPale(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

const TEMP_GRADIENT ='linear-gradient(90deg, #FF9E4A 0%, #FFC98A 20%, #FFF1DE 50%, #F4F4F6 72%, #C7DBFF 100%)';

/**
 * Light card in the design's three layouts.
 *
 * Motion: the icon shape morphs circle ⇄ cookie on toggle; in the colour and
 * temperature layouts the controls fold away on the spatial spring when the
 * light turns off — except the brightness slider, which stays so the light can
 * be brought back up from off. A selected colour preset grows into a cookie with a ring;
 * a selected temperature preset rounds into a pill. Values roll as they
 * change, and the sliders glide to new values.
 *
 * The colour, temperature and full layouts don't tint the whole card. Like the climate card, it
 * keeps the neutral surface and colours the icon shape, state line, switch and
 * brightness slider with the light's own colour (see theme/dynamic.ts). The
 * colour follows the hue / saturation sliders live while dragging and
 * cross-fades on the effects spring.
 */
export class M3eLightCard extends M3eBaseCard<LightCardConfig> {
  /** Coloured by the light itself; its form keeps `color` as a plain fallback select. */
  static override accentPicker = false;

  /** Live values while a slider is being dragged. */
  @state() private live: { brightness?: number; hue?: number; sat?: number; kelvin?: number } = {};
  /** Tab picked by the user in the full layout; undefined follows the light's colour mode. */
  @state() private tab?: LightTab;
  private lastColorMode?: string;

  private gesture = new PressGesture(
    this,
    () => this.runAction(this.config.tap_action?.action ?? 'toggle', this.config.entity),
    () => this.runAction(this.config.hold_action?.action ?? 'more-info', this.config.entity),
  );

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--accent-container);
        color: var(--accent-on-container);
      }
      .card.rich {
        gap: 0;
        padding: 16px 16px 20px;
      }
      /* Every control hidden: just the header row. */
      .card.rich.bare {
        padding-bottom: 16px;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: transform var(--m3e-spatial-fast);
      }
      .top.pressed {
        transform: scale(0.98);
      }
      m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        transition: color var(--m3e-effects-default);
      }
      .text {
        flex: 1;
        min-width: 0;
      }
      .name {
        font: 500 15px / 22px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state {
        font: 400 12px / 18px var(--m3e-font-plain);
        opacity: 0.8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      [data-accent='neutral'] .state {
        color: var(--m3-on-surface-variant);
        opacity: 1;
      }
      .value {
        font: 600 28px / 36px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
        transition: color var(--m3e-effects-default);
      }
      /* Off: the state line already says so; the big slot steps back. */
      .value.off {
        font-weight: 500;
        color: var(--m3-on-surface-variant);
      }
      .tile-slider {
        --m3e-slider-gap: 8px;
      }

      /* Colour layout: neutral card, accents synced to the light's colour. */
      .card.synced {
        background: var(--m3-surface-container);
        color: var(--m3-on-surface);
        --m3e-switch-track: var(--accent-fill);
        --m3e-switch-handle: var(--accent-on-fill);
        --m3e-slider-active: var(--accent-fill);
        --m3e-slider-inactive: var(--accent-track);
        --m3e-slider-handle: var(--m3-on-surface);
        --m3e-slider-icon: var(--accent-on-fill);
        --m3e-slider-icon-outside: var(--m3-on-surface-variant);
        --m3e-slider-ring: var(--m3-surface-container);
      }
      .synced .top m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .synced .state {
        color: var(--accent-fill);
        opacity: 1;
        transition: color var(--m3e-effects-default);
      }
      .synced[data-accent='neutral'] .top m3e-shape {
        --m3e-shape-color: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .synced[data-accent='neutral'] .state {
        color: var(--m3-on-surface-variant);
      }
      .synced .preset[aria-checked='true'] m3e-shape {
        --m3e-shape-stroke: var(--m3-on-surface);
      }
      .synced .add {
        box-shadow: inset 0 0 0 1.5px var(--m3-on-surface-variant);
        color: var(--m3-on-surface-variant);
      }
      /* On the neutral card, presets read like the other button groups:
         neutral when idle, the light's colour when selected. */
      .synced .temps {
        --m3e-group-bg: var(--m3-surface-high);
        --m3e-group-fg: var(--m3-on-surface);
        --m3e-group-selected-bg: var(--accent-fill);
        --m3e-group-selected-fg: var(--accent-on-fill);
      }

      /* Full layout: colour / white tabs and sliding panes. */
      .mode-tabs {
        --m3e-group-height: 40px;
        --m3e-group-radius: 12px;
        --m3e-group-selected-radius: 20px;
        --m3e-group-pressed-radius: 20px;
        --m3e-group-inner-gap: 8px;
      }
      .panes {
        position: relative;
        overflow: hidden;
        /* A little room so focus rings and pressed presets aren't clipped. */
        margin: -4px;
        transition: height var(--m3e-spatial-default);
      }
      .pane {
        position: absolute;
        inset: 0 0 auto 0;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition:
          transform var(--m3e-spatial-default),
          opacity var(--m3e-effects-default),
          visibility var(--m3e-effects-default);
      }
      .pane-color {
        --m3e-pane-out: -32px;
      }
      .pane-temp {
        --m3e-pane-out: 32px;
      }
      .pane[aria-hidden='true'] {
        transform: translateX(var(--m3e-pane-out));
        opacity: 0;
        visibility: hidden;
      }

      /* Collapsible body (colour / temperature layouts) */
      .fold {
        display: grid;
        grid-template-rows: 1fr;
        transition: grid-template-rows var(--m3e-spatial-default);
      }
      .fold.closed {
        grid-template-rows: 0fr;
      }
      .fold > div {
        min-height: 0;
        overflow: hidden;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 16px;
        transition: opacity var(--m3e-effects-default);
      }
      .fold.closed .body {
        opacity: 0;
      }
      /* Continues the slider stack right after the pinned brightness slider. */
      .body.tight {
        padding-top: 12px;
      }
      /* Brightness stays out of the fold, so it can bring the light back from off. */
      .pinned {
        padding-top: 16px;
      }

      .presets {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 40px;
      }
      .preset {
        all: unset;
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        cursor: pointer;
        border-radius: 50%;
        -webkit-tap-highlight-color: transparent;
      }
      .preset:focus-visible {
        outline: 2px solid var(--accent-on-container);
        outline-offset: 2px;
      }
      .preset m3e-shape {
        --m3e-shape-stroke: var(--m3e-swatch-border);
        --m3e-shape-stroke-width: 1px;
        color: #fff;
        transform: scale(0.9);
        transition: transform var(--m3e-spatial-fast);
      }
      .preset[aria-checked='true'] m3e-shape {
        --m3e-shape-stroke: var(--accent-on-container);
        --m3e-shape-stroke-width: 2px;
        transform: none;
      }
      .preset:active m3e-shape {
        transform: scale(0.8);
      }
      .preset m3e-icon {
        --m3e-icon-size: 20px;
        filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.35));
      }
      /* Pale swatches (white, warm white) get a dark check instead. */
      .preset m3e-icon.on-light {
        color: rgb(17 17 27 / 0.75);
        filter: none;
      }
      .add {
        width: 36px;
        height: 36px;
        border-radius: 18px;
        box-shadow: inset 0 0 0 1.5px var(--accent-on-container);
        color: var(--accent-on-container);
        --m3e-icon-size: 20px;
      }
      .add:active {
        border-radius: 10px;
      }

      .temps {
        --m3e-group-height: 48px;
        --m3e-group-radius: 12px;
        --m3e-group-selected-radius: 24px;
        --m3e-group-pressed-radius: 20px;
        --m3e-group-inner-gap: 6px;
        --m3e-group-bg: var(--accent-track);
        --m3e-group-fg: var(--accent-on-container);
        --m3e-group-selected-bg: var(--accent-shape);
        --m3e-group-selected-fg: var(--accent-on-shape);
        --m3e-group-selected-weight: 700;
      }

      .sliders {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font: 500 13px / 20px var(--m3e-font-plain);
      }
      .label .num {
        font: 600 15px / 20px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) {
        --m3e-slider-height: 36px;
      }
      :host([compact]) .card {
        padding: 12px;
        gap: 10px;
      }
      :host([compact]) .card.rich {
        gap: 0;
        padding: 12px 12px 14px;
      }
      :host([compact]) .card.rich.bare {
        padding-bottom: 12px;
      }
      :host([compact]) .top {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .value {
        font: 600 22px / 28px var(--m3e-font-brand);
      }
      :host([compact]) .body {
        gap: 10px;
        padding-top: 12px;
      }
      :host([compact]) .body.tight {
        padding-top: 8px;
      }
      :host([compact]) .pinned {
        padding-top: 12px;
      }
      :host([compact]) .pane,
      :host([compact]) .sliders {
        gap: 8px;
      }
      :host([compact]) .field {
        gap: 2px;
      }
      :host([compact]) .label {
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .label .num {
        font: 600 13px / 18px var(--m3e-font-brand);
      }
      :host([compact]) .presets,
      :host([compact]) .preset {
        height: 36px;
      }
      :host([compact]) .preset {
        width: 36px;
      }
      :host([compact]) .add {
        width: 32px;
        height: 32px;
      }
      :host([compact]) .mode-tabs {
        --m3e-group-height: 36px;
      }
      :host([compact]) .temps {
        --m3e-group-height: 40px;
        --m3e-group-inner-gap: 4px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('light.')) ?? 'light.example';
    return { type: 'custom:m3e-light-card', entity, layout: 'slider' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'light' } } },
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'slider', label: '明るさスライダー' },
                { value: 'color', label: 'カラー（色相・彩度）' },
                { value: 'temperature', label: '色温度' },
                { value: 'full', label: 'フルカラー＋色温度' },
                { value: 'auto', label: '自動（照明の機能に合わせる）' },
              ],
            },
          },
        },
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'color', selector: { select: { options: ACCENT_OPTIONS } } },
        { name: 'show_brightness', default: true, selector: { boolean: {} } },
        { name: 'show_presets', default: true, selector: { boolean: {} } },
        { name: 'show_color_sliders', default: true, selector: { boolean: {} } },
      ],
      computeLabel: (s: { name: string }) =>
        ({
          show_brightness: '明るさスライダーを表示',
          show_presets: 'プリセットを表示',
          show_color_sliders: '色相・彩度・色温度スライダーを表示',
        })[s.name],
    };
  }

  protected normalizeConfig(config: LightCardConfig): LightCardConfig {
    if (!config.entity) throw new Error('entity is required');
    return { layout: 'slider', ...config };
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  protected override defaultAccent(): Accent {
    return this.config.layout === 'color' ? 'pink' : 'yellow';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    const layout = this.resolvedLayout;
    const show = this.show;
    if (layout === 'slider') return show.brightness ? 3 : 2;
    // Header ≈ 2 rows; brightness ≈ 1.5, presets ≈ 1, colour sliders ≈ 1.5 each.
    let rows = 2;
    if (show.brightness) rows += 1.5;
    if (show.presets) rows += 1;
    if (show.sliders) rows += layout === 'color' ? 3 : 1.5;
    if (layout === 'full' && (show.presets || show.sliders)) rows += 1;
    return Math.ceil(rows);
  }

  /** Which optional controls the config shows. */
  private get show() {
    const c = this.config;
    return {
      brightness: c.show_brightness !== false,
      presets: c.show_presets !== false,
      sliders: c.show_color_sliders !== false,
    };
  }

  /** The configured layout, with `auto` resolved from the light's capabilities. */
  // Not named `layout`: HA assigns `card.layout = "grid"` to cards in sections, and a getter-only property would throw.
  private get resolvedLayout(): Exclude<LightLayout, 'auto'> {
    const l = this.config.layout ?? 'slider';
    if (l !== 'auto') return l;
    return layoutFor(this.stateObj(this.config.entity)?.attributes.supported_color_modes);
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed as never);
    // When the light switches between colour and white elsewhere, follow it.
    const mode = this.stateObj(this.config?.entity)?.attributes.color_mode as string | undefined;
    if (mode !== this.lastColorMode) {
      if (this.lastColorMode !== undefined) this.tab = undefined;
      this.lastColorMode = mode;
    }
  }

  // ── values ────────────────────────────────────────────────

  private get brightness(): number {
    const s = this.stateObj(this.config.entity);
    return this.live.brightness ?? (s ? brightnessPct(s) : 0);
  }

  private get hs(): [number, number] {
    const hs = this.stateObj(this.config.entity)?.attributes.hs_color as [number, number] | undefined;
    return [this.live.hue ?? Math.round(hs?.[0] ?? 0), this.live.sat ?? Math.round(hs?.[1] ?? 0)];
  }

  private get kelvin(): number {
    const a = this.stateObj(this.config.entity)?.attributes;
    return this.live.kelvin ?? Math.round(a?.color_temp_kelvin ?? 3500);
  }

  private get kelvinRange(): [number, number] {
    const a = this.stateObj(this.config.entity)?.attributes;
    return [a?.min_color_temp_kelvin ?? 2000, a?.max_color_temp_kelvin ?? 6500];
  }

  private colorPresets(): ColorPreset[] {
    return this.config.presets ?? DEFAULT_COLOR_PRESETS;
  }

  private selectedColorPreset(): ColorPreset | undefined {
    const s = this.stateObj(this.config.entity);
    if (s?.state !== 'on' || s.attributes.color_mode === 'color_temp') return undefined;
    const [h, sat] = this.hs;
    return this.colorPresets().find((p) => {
      const [ph, ps] = hexToHs(p.color);
      return hueDistance(ph, h) <= 6 && Math.abs(ps - sat) <= 8;
    });
  }

  private selectedTempPreset(): TempPreset | undefined {
    const s = this.stateObj(this.config.entity);
    if (s?.state !== 'on' || (s.attributes.color_mode && s.attributes.color_mode !== 'color_temp')) return undefined;
    return (this.config.temperature_presets ?? DEFAULT_TEMP_PRESETS).find((p) => Math.abs(p.kelvin - this.kelvin) <= 150);
  }

  /** The light's current colour in sRGB, following slider drags live. */
  private lightRgb(): [number, number, number] | undefined {
    const s = this.stateObj(this.config.entity);
    if (s?.state !== 'on') return undefined;
    const a = s.attributes;
    const [kmin, kmax] = this.kelvinRange;
    if (this.live.hue !== undefined || this.live.sat !== undefined) return hsToRgb(...this.hs);
    if (this.live.kelvin !== undefined) return kelvinToUiRgb(this.live.kelvin, kmin, kmax);
    // White light: take the tint from the temperature gradient, not rgb_color
    // (which HA reports as a near-white for most temperatures).
    if (a.color_mode === 'color_temp' && a.color_temp_kelvin) return kelvinToUiRgb(a.color_temp_kelvin, kmin, kmax);
    if (Array.isArray(a.rgb_color)) return a.rgb_color as [number, number, number];
    if (Array.isArray(a.hs_color)) return hsToRgb(a.hs_color[0], a.hs_color[1]);
    if (a.color_temp_kelvin) return kelvinToUiRgb(a.color_temp_kelvin, kmin, kmax);
    return undefined;
  }

  /** --accent-* overrides derived from the light's colour, for the synced layout. */
  private syncedAccent(): Record<string, string> {
    const rgb = this.lightRgb();
    if (!rgb) return {};
    return accentFromRgb(rgb, this.getAttribute('theme') === 'mocha' ? 'mocha' : 'latte');
  }

  // ── services ──────────────────────────────────────────────

  private turnOn(data: Record<string, unknown>): void {
    this.call('light', 'turn_on', data, this.config.entity);
  }

  private setBrightness(pct: number): void {
    if (pct <= 0) this.call('light', 'turn_off', {}, this.config.entity);
    else this.turnOn({ brightness_pct: pct });
  }

  private onSlider(key: keyof M3eLightCard['live'], e: CustomEvent<{ value: number }>, commit: (v: number) => void) {
    if (e.type === 'input') {
      this.live = { ...this.live, [key]: e.detail.value };
    } else {
      commit(e.detail.value);
      // Keep the live value until HA reports back, so the slider doesn't jump.
      const v = e.detail.value;
      setTimeout(() => {
        if (this.live[key] === v) {
          const { [key]: _drop, ...rest } = this.live;
          this.live = rest;
        }
      }, 1500);
    }
  }

  // ── render ────────────────────────────────────────────────

  private header(trailing: TemplateResult | typeof nothing, stateLine: string) {
    const s = this.stateObj(this.config.entity);
    const on = s?.state === 'on';
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    return html`<div
      class="top ${this.gesture.pressed ? 'pressed' : ''}"
      role="button"
      tabindex="0"
      aria-label=${name}
      ${press(this.gesture)}
    >
      <m3e-shape .shape=${on ? 'cookie9' : 'circle'} size=${this.compact ? 36 : 44} ?pressed=${this.gesture.pressed}>
        <m3e-icon .icon=${this.config.icon ?? defaultIconFor(s, this.config.entity)}></m3e-icon>
      </m3e-shape>
      <div class="text">
        <p class="name">${name}</p>
        <p class="state">${stateLine}</p>
      </div>
      ${trailing}
    </div>`;
  }

  private brightnessField(on: boolean) {
    return html`<div class="field">
      <div class="label">
        <span>明るさ</span><span class="num">${on || this.live.brightness !== undefined ? `${this.brightness}%` : '—'}</span>
      </div>
      <m3e-slider
        label="明るさ"
        .value=${this.brightness}
        min="0"
        max="100"
        icon="sunny"
        @input=${(e: CustomEvent) => this.onSlider('brightness', e, (v) => this.setBrightness(v))}
        @change=${(e: CustomEvent) => this.onSlider('brightness', e, (v) => this.setBrightness(v))}
      ></m3e-slider>
    </div>`;
  }

  private renderSlider() {
    const s = this.stateObj(this.config.entity);
    const on = s?.state === 'on';
    const dragging = this.live.brightness !== undefined;
    const value = on || dragging ? `${this.brightness}%` : 'オフ';
    const stateLine = on ? `オン${s?.attributes.color_mode === 'color_temp' ? `・${this.kelvinName()}` : ''}` : 'オフ';
    return html`<div class="card ${isUnavailable(s) ? 'unavailable' : ''}" data-accent=${on ? nothing : 'neutral'}>
      ${this.header(
        html`<span class="value ${on || dragging ? '' : 'off'}">${dragging ? value : html`<m3e-rolling-text .text=${value}></m3e-rolling-text>`}</span>`,
        stateLine,
      )}
      ${this.show.brightness
        ? html`<m3e-slider
            class="tile-slider"
            label="明るさ"
            .value=${this.brightness}
            min="0"
            max="100"
            @input=${(e: CustomEvent) => this.onSlider('brightness', e, (v) => this.setBrightness(v))}
            @change=${(e: CustomEvent) => this.onSlider('brightness', e, (v) => this.setBrightness(v))}
          ></m3e-slider>`
        : nothing}
    </div>`;
  }

  private kelvinName(): string {
    const p = (this.config.temperature_presets ?? DEFAULT_TEMP_PRESETS).find((x) => Math.abs(x.kelvin - this.kelvin) <= 150);
    return p?.name ?? `${this.kelvin}K`;
  }

  // ── shared pieces ─────────────────────────────────────────

  private colorPresetRow() {
    const selected = this.selectedColorPreset();
    return html`<div class="presets" role="radiogroup" aria-label="カラープリセット">
      ${this.colorPresets().map((p) => {
        const isSel = p === selected;
        return html`<button
          class="preset"
          role="radio"
          aria-checked=${isSel ? 'true' : 'false'}
          aria-label=${p.name ?? p.color}
          @click=${() => this.turnOn({ hs_color: hexToHs(p.color) })}
        >
          <m3e-shape .shape=${isSel ? 'cookie9' : 'circle'} size=${this.compact ? 34 : 40} style="--m3e-shape-color:${p.color}">
            ${isSel ? html`<m3e-icon class=${isPale(p.color) ? 'on-light' : ''} icon="check-circle"></m3e-icon>` : nothing}
          </m3e-shape>
        </button>`;
      })}
      <button class="preset add icon-btn" aria-label="色を追加" @click=${() => this.moreInfo(this.config.entity)}>
        <m3e-icon icon="add"></m3e-icon>
      </button>
    </div>`;
  }

  private hueSatFields() {
    const [h, sat] = this.hs;
    return html`<div class="field">
        <div class="label"><span>色相</span><span class="num">${h}°</span></div>
        <m3e-slider
          label="色相"
          variant="gradient"
          .gradient=${HUE_GRADIENT}
          .value=${h}
          min="0"
          max="360"
          @input=${(e: CustomEvent) => this.onSlider('hue', e, () => {})}
          @change=${(e: CustomEvent) => this.onSlider('hue', e, (v) => this.turnOn({ hs_color: [v, sat] }))}
        ></m3e-slider>
      </div>
      <div class="field">
        <div class="label"><span>彩度</span><span class="num">${sat}%</span></div>
        <m3e-slider
          label="彩度"
          variant="gradient"
          .gradient=${`linear-gradient(90deg, #F6F2F4 0%, ${hsToCss(h, 100)} 100%)`}
          .value=${sat}
          min="0"
          max="100"
          @input=${(e: CustomEvent) => this.onSlider('sat', e, () => {})}
          @change=${(e: CustomEvent) => this.onSlider('sat', e, (v) => this.turnOn({ hs_color: [h, v] }))}
        ></m3e-slider>
      </div>`;
  }

  private tempPresetGroup() {
    const selected = this.selectedTempPreset();
    const options: GroupOption[] = (this.config.temperature_presets ?? DEFAULT_TEMP_PRESETS).map((p) => ({
      value: String(p.kelvin),
      label: p.name ?? `${p.kelvin}K`,
      sub: p.name ? `${p.kelvin}K` : undefined,
      swatch: SWATCH[p.kelvin] ?? kelvinToCss(p.kelvin),
    }));
    return html`<m3e-button-group
      class="temps"
      label="色温度プリセット"
      .options=${options}
      .value=${selected ? String(selected.kelvin) : ''}
      @select=${(e: CustomEvent<{ value: string }>) => this.turnOn({ color_temp_kelvin: Number(e.detail.value) })}
    ></m3e-button-group>`;
  }

  private kelvinField() {
    const [kmin, kmax] = this.kelvinRange;
    return html`<div class="field">
      <div class="label"><span>色温度</span><span class="num">${this.kelvin}K</span></div>
      <m3e-slider
        label="色温度"
        variant="gradient"
        .gradient=${TEMP_GRADIENT}
        .value=${this.kelvin}
        .min=${kmin}
        .max=${kmax}
        step="50"
        @input=${(e: CustomEvent) => this.onSlider('kelvin', e, () => {})}
        @change=${(e: CustomEvent) => this.onSlider('kelvin', e, (v) => this.turnOn({ color_temp_kelvin: v }))}
      ></m3e-slider>
    </div>`;
  }

  private colorStateLine(): string {
    const selected = this.selectedColorPreset();
    return `オン・${selected?.name ?? `${this.brightness}%`}`;
  }

  private tempStateLine(): string {
    const selected = this.selectedTempPreset();
    return `オン・${selected ? `${selected.name} ${selected.kelvin}K` : `${this.kelvin}K`}`;
  }

  /**
   * Wraps a body so it folds away when the light is off.
   * `tight` continues the slider stack directly under the pinned brightness slider.
   */
  private foldable(on: boolean, body: TemplateResult, tight = false) {
    return html`<div class="fold ${on ? '' : 'closed'}" aria-hidden=${on ? 'false' : 'true'} ?inert=${!on}>
      <div><div class="body ${tight ? 'tight' : ''}">${body}</div></div>
    </div>`;
  }

  /** The brightness slider, kept outside the fold so it stays usable while the light is off. */
  private pinnedBrightness(on: boolean) {
    return html`<div class="pinned">${this.brightnessField(on)}</div>`;
  }

  // ── layouts ───────────────────────────────────────────────

  private renderColor() {
    const s = this.stateObj(this.config.entity);
    const on = s?.state === 'on';
    const show = this.show;
    const bare = !show.brightness && !show.presets && !show.sliders;
    return html`<div
      class="card rich synced ${bare ? 'bare' : ''} ${isUnavailable(s) ? 'unavailable' : ''}"
      data-accent=${on ? nothing : 'neutral'}
      style=${styleMap(this.syncedAccent())}
    >
      ${this.header(this.switch(on), on ? this.colorStateLine() : 'オフ')}
      ${show.presets ? this.foldable(on, this.colorPresetRow()) : nothing}
      ${show.brightness ? this.pinnedBrightness(on) : nothing}
      ${show.sliders ? this.foldable(on, html`<div class="sliders">${this.hueSatFields()}</div>`, show.brightness) : nothing}
    </div>`;
  }

  private renderTemperature() {
    const s = this.stateObj(this.config.entity);
    const on = s?.state === 'on';
    const show = this.show;
    const bare = !show.brightness && !show.presets && !show.sliders;
    return html`<div
      class="card rich synced ${bare ? 'bare' : ''} ${isUnavailable(s) ? 'unavailable' : ''}"
      data-accent=${on ? nothing : 'neutral'}
      style=${styleMap(this.syncedAccent())}
    >
      ${this.header(this.switch(on), on ? this.tempStateLine() : 'オフ')}
      ${show.presets ? this.foldable(on, this.tempPresetGroup()) : nothing}
      ${show.brightness ? this.pinnedBrightness(on) : nothing}
      ${show.sliders ? this.foldable(on, html`<div class="sliders">${this.kelvinField()}</div>`, show.brightness) : nothing}
    </div>`;
  }

  /** The tab that matches what the light is doing now. */
  private modeTab(): LightTab {
    return this.stateObj(this.config.entity)?.attributes.color_mode === 'color_temp' ? 'temp' : 'color';
  }

  /**
   * Full colour + colour temperature. Brightness stays on top; a two-button
   * group switches the pane below between colour and white. The panes slide
   * sideways (colour sits left, white right) and the container's height
   * follows on the spatial spring. Switching tabs only changes the view; the
   * light changes when a preset or slider is used.
   */
  private renderFull() {
    const s = this.stateObj(this.config.entity);
    const on = s?.state === 'on';
    const tab = this.tab ?? this.modeTab();
    const isTemp = s?.attributes.color_mode === 'color_temp';
    const show = this.show;
    // The tabs only make sense when the panes have something in them.
    const panes = show.presets || show.sliders;
    const bare = !show.brightness && !panes;
    const tabs: GroupOption[] = [
      { value: 'color', label: 'カラー', swatch: 'conic-gradient(#FF5C5C, #FFD54A, #5EDB7C, #4FD6E8, #5C7CFF, #D35CFF, #FF5C5C)' },
      { value: 'temp', label: '色温度', swatch: 'linear-gradient(135deg, #FF9E4A, #FFF1DE 55%, #C7DBFF)' },
    ];
    return html`<div
      class="card rich synced ${bare ? 'bare' : ''} ${isUnavailable(s) ? 'unavailable' : ''}"
      data-accent=${on ? nothing : 'neutral'}
      style=${styleMap(this.syncedAccent())}
    >
      ${this.header(this.switch(on), on ? (isTemp ? this.tempStateLine() : this.colorStateLine()) : 'オフ')}
      ${show.brightness ? this.pinnedBrightness(on) : nothing}
      ${panes
        ? this.foldable(
            on,
            html`<m3e-button-group
                class="mode-tabs"
                label="色の種類"
                .options=${tabs}
                .value=${tab}
                @select=${(e: CustomEvent<{ value: LightTab }>) => (this.tab = e.detail.value)}
              ></m3e-button-group>
              <div class="panes" data-tab=${tab}>
                <div class="pane pane-color" ?inert=${tab !== 'color'} aria-hidden=${tab !== 'color' ? 'true' : 'false'}>
                  ${show.presets ? this.colorPresetRow() : nothing} ${show.sliders ? this.hueSatFields() : nothing}
                </div>
                <div class="pane pane-temp" ?inert=${tab !== 'temp'} aria-hidden=${tab !== 'temp' ? 'true' : 'false'}>
                  ${show.presets ? this.tempPresetGroup() : nothing} ${show.sliders ? this.kelvinField() : nothing}
                </div>
              </div>`,
          )
        : nothing}
    </div>`;
  }

  /** Keep the pane container as tall as the visible pane (height transitions). */
  private paneObserver?: ResizeObserver;

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const panes = this.renderRoot.querySelector<HTMLElement>('.panes') ?? undefined;
    if (panes !== this.observedPanes) {
      this.paneObserver?.disconnect();
      this.paneObserver = undefined;
      this.observedPanes = panes;
      if (panes) {
        this.paneObserver = new ResizeObserver(() => this.fitPanes());
        panes.querySelectorAll('.pane').forEach((p) => this.paneObserver!.observe(p));
      }
    }
    this.fitPanes();
  }

  private observedPanes?: HTMLElement;

  private fitPanes(): void {
    const panes = this.observedPanes;
    if (!panes) return;
    const active = panes.querySelector<HTMLElement>(panes.dataset.tab === 'temp' ? '.pane-temp' : '.pane-color');
    if (active) panes.style.height = `${active.offsetHeight}px`;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.paneObserver?.disconnect();
    this.paneObserver = undefined;
    this.observedPanes = undefined;
  }

  private switch(on: boolean) {
    const s = this.stateObj(this.config.entity);
    return html`<m3e-switch
      .checked=${on}
      ?disabled=${isUnavailable(s)}
      label="電源"
      @change=${() => this.call('light', 'toggle', {}, this.config.entity)}
      @pointerup=${(e: Event) => e.stopPropagation()}
    ></m3e-switch>`;
  }

  protected override render() {
    switch (this.resolvedLayout) {
      case 'color':
        return this.renderColor();
      case 'temperature':
        return this.renderTemperature();
      case 'full':
        return this.renderFull();
      default:
        return this.renderSlider();
    }
  }
}

define('m3e-light-card', M3eLightCard);
