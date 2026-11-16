import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ACCENTS, ACCENT_LABELS, themeTokens, type Accent } from '../theme/tokens';
import { define } from '../components/define';
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
}

interface EditorHass {
  themes?: { darkMode?: boolean };
  localize?: Localize;
}

type Config = Record<string, unknown> & { color?: Accent };

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

  protected override render() {
    return html`
      ${this.formReady && this.form.schema.length
        ? html`<ha-form
            .hass=${this.hass}
            .data=${this.config}
            .schema=${this.form.schema}
            .computeLabel=${this.computeLabel}
            .computeHelper=${this.computeHelper}
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
