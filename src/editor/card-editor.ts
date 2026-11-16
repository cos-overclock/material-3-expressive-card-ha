import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ACCENTS, ACCENT_LABELS, themeTokens, type Accent } from '../theme/tokens';
import { define } from '../components/define';
import type { ConfigValidator, Issue } from './validate';
import '../components/m3e-icon';
import '../components/m3e-shape';

type Localize = (key: string) => string;

interface FormSchema {
  name: string;
  [key: string]: unknown;
}

/** What a card's `getConfigForm()` returns (the subset HA's form editor reads). */
export interface ConfigForm {
  schema: FormSchema[];
  computeLabel?: (schema: FormSchema, localize?: Localize) => string | undefined;
  computeHelper?: (schema: FormSchema) => string | undefined;
  /**
   * Reshape the config for the form (e.g. list items written as plain entity
   * ids become `{ entity }` objects for an object selector). The card accepts both.
   */
  toForm?: (config: Record<string, unknown>) => Record<string, unknown>;
}

interface EditorHass {
  themes?: { darkMode?: boolean };
  localize?: Localize;
}

type Config = Record<string, unknown> & { color?: Accent };

/** Japanese labels for option names shared by many cards (a card's own computeLabel wins). */
const COMMON_LABELS: Record<string, string> = {
  entity: 'エンティティ',
  name: '名前',
  icon: 'アイコン',
  title: 'タイトル',
  layout: 'レイアウト',
  tap_action: 'タップしたとき',
  hold_action: '長押ししたとき',
  double_tap_action: 'ダブルタップしたとき',
  interactions: '操作',
  battery_entity: '電池残量',
  calendars: 'カレンダー',
  days: '表示する日数',
  todo: 'To-do リスト',
  show_completed: 'チェック済みを残す件数',
  badges: 'バッジ',
  align: '並べ方',
  events: '検知イベント',
  talk_entity: '通話のスイッチ',
  time_entity: '「〇分前」の基準',
  live: 'ライブ映像',
  humidity_entity: '湿度センサー',
  show_illustration: '窓のイラスト',
  power_entity: '消費電力',
  solar_power_entity: '太陽光の発電電力',
  grid_power_entity: '買電・売電の電力',
  show_chart: 'グラフ',
  devices: '機器',
  period: '期間',
  max_devices: 'エリアごとの機器の数',
  areas: 'エリア',
  schedule: '収集日',
  calendar: 'カレンダー',
  deadline: '締め切り時刻（HH:MM）',
  done_entity: '「出した」を記録するエンティティ',
  note: '注記',
  weather: '天気',
  subtitle: 'サブタイトル',
  forecast_days: '予報の日数',
  forecast_type: '予報の種類',
  course_entity: 'コース',
  completion_entity: '終了時刻',
  remaining_entity: '残り時間',
  notify_entity: '終了通知のスイッチ',
  notify_label: '終了通知の文言',
  stats: '数値',
  steps: '工程',
  door_entity: 'ドアの開閉センサー',
  hold_to_unlock: '長押しで解錠',
  show_open: '「ドアを開ける」ボタン',
  device_name: '機器名',
  people: '家族',
  footnote: '注記',
  scenes: 'シーン',
  active_hours: '実行済みとして色を付ける時間',
  hours: 'グラフの時間（時間）',
  periods: '切り替えられる期間（時間）',
  show_period_selector: '期間の切り替えボタン',
  levels: '値の段階',
  show_switch: 'スイッチを表示',
  secondary_entity: '状態の行に添える値',
  secondary_prefix: '添える値の前の文言',
  rooms: '部屋',
  room_service: '部屋指定に使うスクリプト',
  attribute: '属性',
  kind: '値の種類',
  on_text: 'オンの表示',
  off_text: 'オフの表示',
  unit: '単位',
  decimals: '小数点以下の桁数',
  min: '最小値',
  max: '最大値',
  burning_entity: '燃焼中のセンサー',
  temperatures: '温度',
  fill: 'お湯はり',
  modes: 'ボタン',
  usage: '使用量',
  presets: '色のプリセット',
  temperature_presets: '色温度のプリセット',
  color: '色',
};

/**
 * ha-form is lazy-loaded by HA. It is normally present by the time a card
 * editor opens; if not, opening the entities card's editor loads it.
 */
async function ensureHaForm(): Promise<void> {
  if (customElements.get('ha-form')) return;
  try {
    const helpers = await (window as unknown as { loadCardHelpers?: () => Promise<{ createCardElement(c: object): HTMLElement }> })
      .loadCardHelpers?.();
    const card = helpers?.createCardElement({ type: 'entities', entities: [] });
    await (card?.constructor as { getConfigElement?: () => Promise<unknown> } | undefined)?.getConfigElement?.();
  } catch {
    /* the picker still works without the form */
  }
}

/**
 * HA visual editor for every m3e card: the card's own `getConfigForm()`
 * rendered with ha-form, then a Catppuccin swatch picker for `color` with a
 * Latte / Mocha preview of the chosen accent.
 */
export class M3eCardEditor extends LitElement {
  @property({ attribute: false }) hass?: EditorHass;
  /** Set by the card class before HA calls setConfig. */
  @property({ attribute: false }) form: ConfigForm = { schema: [] };
  /** Whether to show the accent picker (off for cards that colour themselves). */
  @property({ attribute: false }) picker = true;
  /** What `color` changes on this card, shown under the swatches. */
  @property({ attribute: false }) hint?: string;
  /** The card's config checks; their findings are listed above the form. */
  @property({ attribute: false }) validate?: ConfigValidator;
  @state() private config: Config = {};
  @state() private formReady = !!customElements.get('ha-form');

  static override styles = [
    themeTokens,
    css`
      :host {
        display: block;
      }
      .accent {
        margin-top: 24px;
      }
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
      }
      .label {
        font: 500 14px / 20px var(--mdc-typography-body1-font-family, var(--m3e-font-plain));
        color: var(--primary-text-color, var(--m3-on-surface));
      }
      .current {
        font: 400 13px / 20px var(--mdc-typography-body1-font-family, var(--m3e-font-plain));
        color: var(--secondary-text-color, var(--m3-on-surface-variant));
      }
      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fill, 36px);
        gap: 10px;
        justify-content: start;
      }
      .swatch {
        all: unset;
        box-sizing: border-box;
        position: relative;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        box-shadow: inset 0 0 0 1px var(--m3e-swatch-border);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          transform var(--m3e-spatial-fast, 0.2s),
          border-radius var(--m3e-spatial-fast, 0.2s);
      }
      .swatch:hover {
        transform: scale(1.08);
      }
      .swatch:active {
        transform: scale(0.92);
      }
      .swatch:focus-visible {
        outline: 2px solid var(--primary-color, var(--m3-on-surface));
        outline-offset: 2px;
      }
      .swatch[aria-checked='true'] {
        border-radius: 12px;
        outline: 2px solid var(--primary-text-color, var(--m3-on-surface));
        outline-offset: 2px;
      }
      .swatch m3e-icon {
        --m3e-icon-size: 20px;
      }
      .swatch.auto {
        background: transparent;
        color: var(--secondary-text-color, var(--m3-on-surface-variant));
        box-shadow: inset 0 0 0 1.5px var(--divider-color, var(--m3-outline-variant));
        font: 500 11px / 1 var(--m3e-font-plain);
      }
      .hint {
        margin: 10px 0 0;
        font: 400 12px / 18px var(--mdc-typography-body1-font-family, var(--m3e-font-plain));
        color: var(--secondary-text-color, var(--m3-on-surface-variant));
      }
      .issues {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0 0 16px;
        padding: 0;
        list-style: none;
      }
      .issue {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 12px;
        font: 400 13px / 18px var(--mdc-typography-body1-font-family, var(--m3e-font-plain));
      }
      .issue m3e-icon {
        --m3e-icon-size: 18px;
        flex: none;
      }
      .issue.error {
        background: var(--acc-red-container);
        color: var(--acc-on-red-container);
      }
      .issue.warning {
        background: var(--acc-yellow-container);
        color: var(--acc-on-yellow-container);
      }
      .issue code {
        font-family: var(--code-font-family, ui-monospace, monospace);
        font-size: 12px;
        opacity: 0.8;
      }
      .preview {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 14px;
      }
    `,
  ];

  setConfig(config: Config): void {
    this.config = config;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.formReady) ensureHaForm().then(() => (this.formReady = !!customElements.get('ha-form')));
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('hass')) this.setAttribute('theme', this.hass?.themes?.darkMode ? 'mocha' : 'latte');
  }

  private computeLabel = (s: FormSchema): string =>
    this.form.computeLabel?.(s, this.hass?.localize) ||
    COMMON_LABELS[s.name] ||
    this.hass?.localize?.(`ui.panel.lovelace.editor.card.generic.${s.name}`) ||
    s.name;

  private computeHelper = (s: FormSchema): string | undefined => this.form.computeHelper?.(s);

  private emit(config: Config): void {
    this.config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private onFormChanged(e: CustomEvent<{ value: Config }>): void {
    e.stopPropagation();
    this.emit(e.detail.value);
  }

  private pick(color: Accent | undefined): void {
    if (color === this.config.color) return;
    const next = { ...this.config };
    if (color) next.color = color;
    else delete next.color;
    this.emit(next);
  }

  /** Arrow keys move through the swatches like a radio group. */
  private onKey(e: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const options = [undefined, ...ACCENTS];
    const i = options.indexOf(this.config.color);
    const next = options[(i + step + options.length) % options.length];
    this.pick(next);
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.swatch[aria-checked="true"]')?.focus());
  }

  private renderPicker() {
    const current = this.config.color && ACCENTS.includes(this.config.color) ? this.config.color : undefined;
    const tab = (c: Accent | undefined) => (c === current ? 0 : -1);
    return html`<div class="accent">
      <div class="head">
        <span class="label" id="accent-label">アクセントカラー</span>
        <span class="current">${current ? ACCENT_LABELS[current] : '自動（カードの既定）'}</span>
      </div>
      <div class="swatches" role="radiogroup" aria-labelledby="accent-label" @keydown=${this.onKey}>
        <button
          class="swatch auto"
          role="radio"
          aria-checked=${current ? 'false' : 'true'}
          aria-label="自動"
          title="自動"
          tabindex=${tab(undefined)}
          @click=${() => this.pick(undefined)}
        >
          自動
        </button>
        ${ACCENTS.map(
          (a) => html`<button
            class="swatch"
            data-accent=${a}
            role="radio"
            aria-checked=${a === current ? 'true' : 'false'}
            aria-label=${ACCENT_LABELS[a]}
            title=${ACCENT_LABELS[a]}
            tabindex=${tab(a)}
            @click=${() => this.pick(a)}
          >
            ${a === current ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}
          </button>`,
        )}
      </div>
      ${current
        ? html`<div class="preview">
            <m3e-accent-sample theme="latte" .accent=${current}></m3e-accent-sample>
            <m3e-accent-sample theme="mocha" .accent=${current}></m3e-accent-sample>
          </div>`
        : nothing}
      <p class="hint">${this.hint ?? '自動のときは、カードごとの既定の色を使います。'}</p>
    </div>`;
  }

  /** The config's issues, errors first. */
  private issues(): Issue[] {
    let list: Issue[];
    try {
      list = this.validate?.(this.config) ?? [];
    } catch {
      list = [];
    }
    return [...list].sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'));
  }

  /** Errors under their form field (ha-form shows `error[name]` below that field). */
  private fieldErrors(issues: Issue[]): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const i of issues) {
      const field = i.path.split('.')[0];
      if (i.level === 'error' && !out[field]) out[field] = i.hint;
    }
    return Object.keys(out).length ? out : undefined;
  }

  private renderIssues(issues: Issue[]) {
    if (!issues.length) return nothing;
    return html`<ul class="issues" role="alert" aria-label="設定の確認">
      ${issues.map(
        (i) => html`<li class="issue ${i.level}">
          <m3e-icon icon=${i.level === 'error' ? 'error' : 'warning'}></m3e-icon>
          <span>${i.hint} <code>${i.path}</code></span>
        </li>`,
      )}
    </ul>`;
  }

  protected override render() {
    const issues = this.issues();
    return html`
      ${this.renderIssues(issues)}
      ${this.formReady && this.form.schema.length
        ? html`<ha-form
            .hass=${this.hass}
            .data=${this.form.toForm ? this.form.toForm(this.config) : this.config}
            .schema=${this.form.schema}
            .computeLabel=${this.computeLabel}
            .computeHelper=${this.computeHelper}
            .error=${this.fieldErrors(issues)}
            .computeError=${(e: string) => e}
            @value-changed=${this.onFormChanged}
          ></ha-form>`
        : nothing}
      ${this.picker ? this.renderPicker() : nothing}
    `;
  }
}

/**
 * A small tile in one palette (Latte or Mocha) showing every role of an
 * accent: container and its text, the icon shape, a filled button and a
 * slider (track + fill).
 */
export class M3eAccentSample extends LitElement {
  @property({ attribute: false }) accent: Accent = 'blue';

  static override styles = [
    themeTokens,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .tile {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 4px 10px;
        padding: 10px 12px;
        border-radius: 16px;
        background: var(--m3e-bg);
        box-shadow: inset 0 0 0 1px var(--m3e-swatch-border);
        font-family: var(--m3e-font-plain);
      }
      .chip {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px 6px 6px;
        border-radius: 12px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        min-width: 0;
      }
      m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        --m3e-icon-size: 16px;
      }
      .name {
        flex: 1;
        min-width: 0;
        font: 600 12px / 16px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .theme {
        font: 400 11px / 14px var(--m3e-font-plain);
        opacity: 0.8;
      }
      .track {
        grid-column: 1 / 3;
        height: 6px;
        border-radius: 3px;
        background: var(--accent-track);
        overflow: hidden;
      }
      .track i {
        display: block;
        width: 60%;
        height: 100%;
        border-radius: 3px;
        background: var(--accent-fill);
      }
      .fill {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        --m3e-icon-size: 16px;
      }
    `,
  ];

  protected override render() {
    const theme = this.getAttribute('theme') === 'mocha' ? 'Mocha' : 'Latte';
    return html`<div class="tile" data-accent=${this.accent} aria-hidden="true">
      <div class="chip">
        <m3e-shape shape="cookie9" size="28"><m3e-icon icon="lightbulb"></m3e-icon></m3e-shape>
        <span class="name">${ACCENT_LABELS[this.accent]}</span>
        <span class="theme">${theme}</span>
      </div>
      <div class="track"><i></i></div>
      <span class="fill"><m3e-icon icon="add"></m3e-icon></span>
    </div>`;
  }
}

define('m3e-card-editor', M3eCardEditor);
define('m3e-accent-sample', M3eAccentSample);

declare global {
  interface HTMLElementTagNameMap {
    'm3e-card-editor': M3eCardEditor;
    'm3e-accent-sample': M3eAccentSample;
  }
}
