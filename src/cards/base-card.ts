import { LitElement, css, html, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { Directive, directive, type ElementPart } from 'lit/directive.js';
import { motionTokens } from '../motion/motion-css';
import { ACCENTS, themeTokens, type Accent } from '../theme/tokens';
import { ensureFonts, fireAction, fireHaptic, fireMoreInfo, toggleEntity } from '../ha/helpers';
import '../editor/card-editor';
import '../components/m3e-icon';
import type { ConfigForm } from '../editor/card-editor';
import { checkOneOf, throwFirstError, type ConfigValidator, type Issue } from '../editor/validate';
import type { ActionConfig, ActionType, HassEntity, HomeAssistant, LovelaceCardConfig, LovelaceGridOptions } from '../ha/types';

/**
 * auto: compact on phones and tablets (see COMPACT_QUERY), comfortable elsewhere.
 * A theme can set `m3e-density: compact | comfortable` to override `auto` for every card.
 */
export type Density = 'auto' | 'compact' | 'comfortable';

/** Viewports that get the compact density under `density: auto`. */
export const COMPACT_QUERY = '(max-width: 1024px), (pointer: coarse)';

const compactMedia = typeof matchMedia === 'function' ? matchMedia(COMPACT_QUERY) : undefined;

/** `--m3e-density` from the HA theme (set on <html>), or '' when unset. */
function themeDensity(el: Element): string {
  const read = (e: Element) => getComputedStyle(e).getPropertyValue('--m3e-density').trim();
  return (el.isConnected ? read(el) : '') || read(document.documentElement);
}

export interface BaseCardConfig extends LovelaceCardConfig {
  /** Spacing and type size. Default auto: compact on phones and tablets. */
  density?: Density;
  /** Accent colour: one of the 14 Catppuccin accents (see ACCENTS). */
  color?: Accent;
  /** Force a palette; default follows HA's dark mode. */
  theme?: 'auto' | 'latte' | 'mocha';
  /**
   * Cards with one tap surface (tile, light, value, alarm…) run it on a tap;
   * cards with many controls run it from their header (icon and name).
   */
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

/** Actions the card runs itself; everything else goes to HA's `hass-action` handler. */
const LOCAL_ACTIONS = new Set<ActionType>(['toggle', 'more-info', 'none']);

/** The three action fields for a card's getConfigForm() (HA's action editor). */
export const ACTION_FIELDS = [
  { name: 'tap_action', selector: { ui_action: {} } },
  { name: 'hold_action', selector: { ui_action: {} } },
  { name: 'double_tap_action', selector: { ui_action: {} } },
];

/** Only the tap action: for cards whose header is the one place an action runs. */
export const TAP_ACTION_FIELD = [ACTION_FIELDS[0]];

/** A collapsible "操作" section for a form, holding the given action fields. */
export function actionsSection(fields: { name: string }[] = ACTION_FIELDS) {
  return { name: 'interactions', type: 'expandable', flatten: true, title: '操作', icon: 'mdi:gesture-tap', schema: fields };
}

/** Checks every card shares: density, color, theme and the actions. */
export function baseIssues(config: Record<string, unknown>): Issue[] {
  const out = [
    ...checkOneOf(config, 'density', ['auto', 'compact', 'comfortable'], '密度'),
    ...checkOneOf(config, 'color', ACCENTS, 'アクセントカラー'),
    ...checkOneOf(config, 'theme', ['auto', 'latte', 'mocha'], 'テーマ'),
  ];
  for (const key of ['tap_action', 'hold_action', 'double_tap_action'] as const) {
    const a = config[key];
    if (a !== undefined && (typeof a !== 'object' || !a || typeof (a as ActionConfig).action !== 'string')) {
      out.push({ path: key, level: 'error', message: `${key} must look like { action: more-info }`, hint: `${ACTION_LABELS[key]}の動作は { action: more-info } の形で書いてください` });
    }
  }
  return out;
}

/** The base checks, then the card class's own `validateConfig`. */
export function validateCard(cls: { validateConfig?: ConfigValidator }, config: Record<string, unknown>): Issue[] {
  return [...baseIssues(config), ...(cls.validateConfig?.(config) ?? [])];
}

/** Labels for the action fields, shared by every card's computeLabel. */
export const ACTION_LABELS: Record<string, string> = {
  tap_action: 'タップしたとき',
  hold_action: '長押ししたとき',
  double_tap_action: 'ダブルタップしたとき',
  interactions: '操作',
};

/**
 * Shared behaviour for every m3e card:
 *  - palette (Latte/Mocha) on the host from HA's dark mode or `theme`
 *  - accent colour from `color`
 *  - re-render only when a watched entity changes
 *  - tap / hold / double-tap actions with press feedback
 *  - a clock (`clockInterval()`) that pauses while the page is hidden
 *  - a "not found" card when the configured entity doesn't exist
 */
export abstract class M3eBaseCard<C extends BaseCardConfig = BaseCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config!: C;
  /** True while the card renders its compact density. Mirrored to the `compact` host attribute. */
  @state() protected compact = false;
  /** Bumped every clockInterval() ms while the page is visible, re-rendering the card. */
  @state() protected clockNow = Date.now();
  private ownClockTimer?: ReturnType<typeof setInterval>;
  private lastVisible = true;
  private readonly onMedia = () => this.syncDensity();
  private readonly onVisibility = () => this.syncClock();

  static baseStyles = css`
    :host {
      display: block;
      color: var(--m3-on-surface);
      font-family: var(--m3e-font-plain);
      -webkit-font-smoothing: antialiased;
      /* Japanese wraps at phrase boundaries, never leaving one kana on its own line. */
      word-break: auto-phrase;
      line-break: strict;
      text-wrap: pretty;
    }
    * {
      box-sizing: border-box;
    }
    p {
      margin: 0;
    }
    .card {
      position: relative;
      border-radius: 20px;
      background: var(--m3-surface-container);
      transition:
        background-color var(--m3e-effects-default),
        color var(--m3e-effects-default),
        transform var(--m3e-spatial-fast);
      -webkit-tap-highlight-color: transparent;
    }
    .card.interactive {
      cursor: pointer;
      user-select: none;
    }
    .card.interactive.pressed {
      transform: scale(0.97);
    }
    .card:focus-visible {
      outline: 2px solid var(--accent-fill);
      outline-offset: 2px;
    }
    .unavailable {
      opacity: 0.5;
    }
    .icon-btn {
      all: unset;
      box-sizing: border-box;
      display: inline-grid;
      place-items: center;
      cursor: pointer;
      flex: none;
      -webkit-tap-highlight-color: transparent;
      transition:
        border-radius var(--m3e-spatial-fast),
        transform var(--m3e-spatial-fast),
        background-color var(--m3e-effects-default),
        color var(--m3e-effects-default);
    }
    .icon-btn:focus-visible {
      outline: 2px solid var(--accent-fill);
      outline-offset: 2px;
    }
    .icon-btn:active {
      transform: scale(0.92);
    }
    .m3e-missing {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border-radius: 20px;
      background: var(--acc-red-container);
      color: var(--acc-on-red-container);
      font: 500 14px / 20px var(--m3e-font-plain);
      overflow: hidden;
    }
    .m3e-missing m3e-icon {
      --m3e-icon-size: 22px;
    }
    .m3e-missing small {
      display: block;
      font: 400 12px / 16px var(--m3e-font-plain);
      opacity: 0.85;
      overflow-wrap: anywhere;
    }
  `;

  static override styles: CSSResultGroup = [motionTokens, themeTokens, M3eBaseCard.baseStyles];

  /** Whether HA's editor shows the accent swatches under the card's form. */
  static accentPicker = true;
  /** What `color` changes on this card, shown under the swatches. */
  static accentHint?: string;

  /**
   * HA's visual editor: the card's `getConfigForm()` in ha-form, then the
   * Catppuccin swatch picker for `color` with a Latte / Mocha preview.
   */
  static getConfigElement(): HTMLElement {
    const cls = this as unknown as { accentPicker: boolean; accentHint?: string; getConfigForm?: () => ConfigForm; validateConfig?: ConfigValidator };
    const el = document.createElement('m3e-card-editor');
    el.form = cls.getConfigForm?.() ?? { schema: [] };
    el.validate = (config) => validateCard(cls, config);
    el.picker = cls.accentPicker;
    el.hint = cls.accentHint;
    return el;
  }

  /** Entities whose changes should re-render the card. */
  protected abstract watchedEntities(): string[];

  /** Validate and normalise the config. Throw to show HA's error card. */
  protected abstract normalizeConfig(config: C): C;

  /** The card's content; render() shows a warning instead when the entity is missing. */
  protected abstract renderCard(): unknown;

  /**
   * Re-render every this many ms while the page is visible (0 = never). Cards that
   * show relative times or refetch data on a schedule return a period here.
   */
  protected clockInterval(): number {
    return 0;
  }

  /** Called when the page is hidden or shown again (pause polling, video…). */
  protected visibilityChanged(_visible: boolean): void {}

  /** True while the tab is in the foreground and the card is on the page. */
  protected get pageVisible(): boolean {
    return this.isConnected && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  }

  /**
   * Card-specific config checks (see src/editor/validate.ts). Errors make
   * setConfig throw; the editor lists errors and warnings while editing.
   */
  static validateConfig?: ConfigValidator;

  setConfig(config: C): void {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    throwFirstError(validateCard(this.constructor as { validateConfig?: ConfigValidator }, config as Record<string, unknown>));
    this.config = this.normalizeConfig({ ...config });
    this.syncDensity();
    if (this.isConnected) this.syncClock();
  }

  /** Whether the card should be compact now: config, then the theme, then the viewport. */
  protected isCompact(): boolean {
    const density = this.config?.density ?? 'auto';
    if (density !== 'auto') return density === 'compact';
    const fromTheme = themeDensity(this);
    if (fromTheme === 'compact' || fromTheme === 'comfortable') return fromTheme === 'compact';
    return compactMedia?.matches ?? false;
  }

  private syncDensity(): void {
    const compact = this.isCompact();
    if (compact !== this.compact) this.compact = compact;
    this.toggleAttribute('compact', compact);
  }

  /** Re-read clockInterval() now (e.g. a timer started, so the card needs a 1s clock). */
  protected restartClock(): void {
    this.syncClock();
  }

  /** (Re)start the clock for the current config and page visibility; report visibility changes. */
  private syncClock(): void {
    clearInterval(this.ownClockTimer);
    this.ownClockTimer = undefined;
    const visible = this.pageVisible;
    const ms = visible && this.config ? this.clockInterval() : 0;
    if (ms > 0) {
      // Coming back to the page catches up at once.
      this.clockNow = Date.now();
      this.ownClockTimer = setInterval(() => (this.clockNow = Date.now()), ms);
    }
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.visibilityChanged(visible);
    }
  }

  getCardSize(): number {
    return 2;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto' };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    ensureFonts();
    compactMedia?.addEventListener('change', this.onMedia);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.syncDensity();
    this.syncClock();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    compactMedia?.removeEventListener('change', this.onMedia);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.syncClock();
  }

  protected override shouldUpdate(changed: PropertyValues<this>): boolean {
    if (!this.config) return false;
    if (changed.size !== 1 || !changed.has('hass')) return true;
    const prev = changed.get('hass') as HomeAssistant | undefined;
    if (!prev || !this.hass) return true;
    // A theme switch may change --m3e-density.
    if (prev.themes?.theme !== this.hass.themes?.theme) this.syncDensity();
    if (prev.themes?.darkMode !== this.hass.themes?.darkMode) return true;
    // The configured entity appeared or went away: swap between the card and the warning.
    const id = this.config.entity;
    if (typeof id === 'string' && !prev.states[id] !== !this.hass.states[id]) return true;
    return this.watchedEntities().some((id) => prev.states[id] !== this.hass!.states[id]);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    const forced = this.config?.theme;
    const theme = forced && forced !== 'auto' ? forced : this.hass?.themes?.darkMode ? 'mocha' : 'latte';
    if (this.getAttribute('theme') !== theme) this.setAttribute('theme', theme);
    if (changed.has('config' as keyof M3eBaseCard)) {
      const accent = this.config.color ?? this.defaultAccent();
      if (accent) this.dataset.accent = accent;
      else delete this.dataset.accent;
    }
  }

  /** The configured `entity` when HA has loaded and doesn't know it. */
  protected missingEntity(): string | undefined {
    const id = this.config?.entity;
    if (typeof id !== 'string' || !id || !this.hass) return undefined;
    // Before HA has sent any state, "missing" only means "not loaded yet".
    const states = this.hass.states;
    if (states[id]) return undefined;
    for (const _ in states) return id;
    return undefined;
  }

  protected override render() {
    const missing = this.missingEntity();
    if (missing) {
      return html`<div class="m3e-missing" role="alert">
        <m3e-icon icon="warning"></m3e-icon>
        <div>エンティティが見つかりません<small>${missing}</small></div>
      </div>`;
    }
    return this.renderCard();
  }

  protected defaultAccent(): Accent | undefined {
    return undefined;
  }

  protected stateObj(entityId: string | undefined): HassEntity | undefined {
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  /**
   * Call a service. The returned promise settles with the call, so a card can
   * show progress and undo an optimistic change when it fails. A failure is
   * logged here, so callers that don't wait for the result can ignore it.
   * (HA's frontend also shows its own toast for a failed call.)
   */
  protected call(domain: string, service: string, data: Record<string, unknown> = {}, entityId?: string): Promise<unknown> {
    const p = this.hass
      ? Promise.resolve().then(() => this.hass!.callService(domain, service, data, entityId ? { entity_id: entityId } : undefined))
      : Promise.reject(new Error('Home Assistant is not connected'));
    p.catch((e) => console.warn(`${this.localName}: ${domain}.${service} failed`, e));
    return p;
  }

  /**
   * Run an action. toggle / more-info / none run here (so the card reacts at
   * once); every other action, and any that asks for confirmation, goes to HA.
   */
  protected runAction(action: ActionConfig | ActionType | undefined, entityId: string | undefined): void {
    const cfg: ActionConfig | undefined = typeof action === 'string' ? { action } : action;
    if (!cfg || cfg.action === 'none' || !this.hass) return;
    if (cfg.confirmation || !LOCAL_ACTIONS.has(cfg.action)) {
      fireAction(this, cfg, entityId);
      return;
    }
    const target = cfg.entity ?? entityId;
    if (!target) return;
    if (cfg.action === 'more-info') {
      fireMoreInfo(this, target);
    } else if (cfg.action === 'toggle') {
      const s = this.stateObj(target);
      if (!s) return;
      fireHaptic(this, 'light');
      toggleEntity(this.hass, s);
    }
  }

  /** The configured tap / hold / double-tap action, or `fallback` when none is set. */
  protected actionFor(kind: 'tap' | 'hold' | 'double_tap', fallback: ActionType): ActionConfig {
    return this.config[`${kind}_action`] ?? { action: fallback };
  }

  /** Run the configured tap / hold / double-tap action (or `fallback`) on the card's entity. */
  protected handleAction(kind: 'tap' | 'hold' | 'double_tap', fallback: ActionType): void {
    this.runAction(this.actionFor(kind, fallback), this.config.entity as string | undefined);
  }

  /** PressGesture's double-tap hook: a handler only when a double_tap_action is set. */
  protected readonly doubleTap = () => (this.config?.double_tap_action ? () => this.handleAction('double_tap', 'none') : undefined);

  /**
   * A tap on a card's header (icon and name): the card's `tap_action` when one is
   * set and the header shows the card's own entity, else the more-info dialog.
   */
  protected tapEntity(entityId: string | undefined): void {
    if (entityId && entityId === this.config.entity && this.config.tap_action) this.runAction(this.config.tap_action, entityId);
    else this.moreInfo(entityId);
  }

  protected moreInfo(entityId: string | undefined): void {
    if (entityId) fireMoreInfo(this, entityId);
  }
}

/** How long a second tap may follow the first to count as a double tap. */
const DOUBLE_TAP_MS = 250;

/**
 * Tap / hold / double-tap recognition with a `pressed` flag for feedback. Hold
 * fires after 500ms without much movement; the tap that would follow is then
 * suppressed. A tap waits DOUBLE_TAP_MS for a second one only when
 * `doubleTap()` returns a handler, so plain taps stay instant.
 *
 * Keyboard: Enter / Space tap; Shift+Enter or the context-menu key hold.
 */
export class PressGesture {
  pressed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private tapTimer?: ReturnType<typeof setTimeout>;
  private held = false;
  private start: [number, number] = [0, 0];

  constructor(
    private readonly host: LitElement,
    private readonly onTap: () => void,
    private readonly onHold?: () => void,
    private readonly doubleTap?: () => (() => void) | undefined,
  ) {}

  readonly handlers = {
    pointerdown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.pressed = true;
      this.held = false;
      this.start = [e.clientX, e.clientY];
      this.host.requestUpdate();
      if (this.onHold) {
        this.timer = setTimeout(() => {
          this.held = true;
          this.pressed = false;
          this.host.requestUpdate();
          this.hold();
        }, 500);
      }
    },
    pointermove: (e: PointerEvent) => {
      if (!this.pressed) return;
      if (Math.hypot(e.clientX - this.start[0], e.clientY - this.start[1]) > 10) this.cancel();
    },
    pointerup: () => {
      clearTimeout(this.timer);
      const fire = this.pressed && !this.held;
      this.pressed = false;
      this.host.requestUpdate();
      if (fire) this.tap();
    },
    pointerleave: () => this.cancel(),
    pointercancel: () => this.cancel(),
    keydown: (e: KeyboardEvent) => {
      // Ignore keys bubbling up from nested controls (switch, slider…).
      if (e.target !== e.currentTarget) return;
      if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ContextMenu') {
        if (!this.onHold) return;
        e.preventDefault();
        this.hold();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.tap();
      }
    },
  };

  private tap(): void {
    const second = this.doubleTap?.();
    if (!second) {
      this.onTap();
      return;
    }
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = undefined;
      second();
      return;
    }
    this.tapTimer = setTimeout(() => {
      this.tapTimer = undefined;
      this.onTap();
    }, DOUBLE_TAP_MS);
  }

  private hold(): void {
    if (!this.onHold) return;
    fireHaptic(this.host, 'medium');
    this.onHold();
  }

  private cancel(): void {
    clearTimeout(this.timer);
    if (this.pressed) {
      this.pressed = false;
      this.host.requestUpdate();
    }
  }
}

/** Element directive: `<div ${press(gesture)}>` wires a PressGesture's listeners. */
class PressDirective extends Directive {
  private gesture?: PressGesture;
  private attached?: Element;

  render(_gesture: PressGesture) {
    return nothing;
  }

  override update(part: ElementPart, [gesture]: [PressGesture]) {
    this.gesture = gesture;
    if (this.attached !== part.element) {
      this.attached = part.element;
      for (const type of Object.keys(gesture.handlers) as (keyof PressGesture['handlers'])[]) {
        part.element.addEventListener(type, (e) => (this.gesture!.handlers[type] as (ev: Event) => void)(e));
      }
    }
    return nothing;
  }
}

export const press = directive(PressDirective);
