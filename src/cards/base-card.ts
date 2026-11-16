import { LitElement, css, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { Directive, directive, type ElementPart } from 'lit/directive.js';
import { motionTokens } from '../motion/motion-css';
import { ACCENTS, themeTokens, type Accent } from '../theme/tokens';
import { ensureFonts, fireMoreInfo, toggleEntity } from '../ha/helpers';
import '../editor/card-editor';
import type { ConfigForm } from '../editor/card-editor';
import type { ActionType, HassEntity, HomeAssistant, LovelaceCardConfig, LovelaceGridOptions } from '../ha/types';

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
  tap_action?: { action: ActionType };
  hold_action?: { action: ActionType };
}

/**
 * Shared behaviour for every m3e card:
 *  - palette (Latte/Mocha) on the host from HA's dark mode or `theme`
 *  - accent colour from `color`
 *  - re-render only when a watched entity changes
 *  - tap / hold actions with press feedback
 */
export abstract class M3eBaseCard<C extends BaseCardConfig = BaseCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config!: C;
  /** True while the card renders its compact density. Mirrored to the `compact` host attribute. */
  @state() protected compact = false;
  private readonly onMedia = () => this.syncDensity();

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
    const cls = this as unknown as { accentPicker: boolean; accentHint?: string; getConfigForm?: () => ConfigForm };
    const el = document.createElement('m3e-card-editor');
    el.form = cls.getConfigForm?.() ?? { schema: [] };
    el.picker = cls.accentPicker;
    el.hint = cls.accentHint;
    return el;
  }

  /** Entities whose changes should re-render the card. */
  protected abstract watchedEntities(): string[];

  /** Validate and normalise the config. Throw to show HA's error card. */
  protected abstract normalizeConfig(config: C): C;

  setConfig(config: C): void {
    if (!config) throw new Error('Invalid configuration');
    if (config.density && !['auto', 'compact', 'comfortable'].includes(config.density)) {
      throw new Error('density must be one of: auto, compact, comfortable');
    }
    if (config.color && !ACCENTS.includes(config.color)) {
      throw new Error(`color must be one of: ${ACCENTS.join(', ')}`);
    }
    this.config = this.normalizeConfig({ ...config });
    this.syncDensity();
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
    this.syncDensity();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    compactMedia?.removeEventListener('change', this.onMedia);
  }

  protected override shouldUpdate(changed: PropertyValues<this>): boolean {
    if (!this.config) return false;
    if (changed.size !== 1 || !changed.has('hass')) return true;
    const prev = changed.get('hass') as HomeAssistant | undefined;
    if (!prev || !this.hass) return true;
    // A theme switch may change --m3e-density.
    if (prev.themes?.theme !== this.hass.themes?.theme) this.syncDensity();
    if (prev.themes?.darkMode !== this.hass.themes?.darkMode) return true;
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

  protected defaultAccent(): Accent | undefined {
    return undefined;
  }

  protected stateObj(entityId: string | undefined): HassEntity | undefined {
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  protected call(domain: string, service: string, data: Record<string, unknown> = {}, entityId?: string): void {
    this.hass?.callService(domain, service, data, entityId ? { entity_id: entityId } : undefined);
  }

  protected runAction(action: ActionType | undefined, entityId: string | undefined): void {
    if (!entityId || !this.hass || action === 'none') return;
    if (action === 'more-info') fireMoreInfo(this, entityId);
    else if (action === 'toggle') {
      const s = this.stateObj(entityId);
      if (s) toggleEntity(this.hass, s);
    }
  }

  protected moreInfo(entityId: string | undefined): void {
    if (entityId) fireMoreInfo(this, entityId);
  }
}

/**
 * Tap / hold recognition with a `pressed` flag for feedback. Hold fires after
 * 500ms without much movement; the tap that would follow is then suppressed.
 */
export class PressGesture {
  pressed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private held = false;
  private start: [number, number] = [0, 0];

  constructor(
    private readonly host: LitElement,
    private readonly onTap: () => void,
    private readonly onHold?: () => void,
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
          this.onHold?.();
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
      if (fire) this.onTap();
    },
    pointerleave: () => this.cancel(),
    pointercancel: () => this.cancel(),
    keydown: (e: KeyboardEvent) => {
      // Ignore keys bubbling up from nested controls (switch, slider…).
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onTap();
      }
    },
  };

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
