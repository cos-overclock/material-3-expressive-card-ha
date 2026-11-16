import { css, html, nothing, svg, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { hhmm, isUnavailable, numState, relativeTime } from '../ha/helpers';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { SPRINGS, SpringValue, prefersReducedMotion } from '../motion/spring';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';

export interface LockCardConfig extends BaseCardConfig {
  entity: string;
  name?: string;
  /**
   * full (default): the large hold-to-unlock button, keypad and chips.
   * compact: one row with a 施錠 / 解錠 button (unlock takes a second tap).
   */
  layout?: 'full' | 'compact';
  /** binary_sensor for the door itself (open / closed). */
  door_entity?: string;
  /** Battery level of the lock (%). */
  battery_entity?: string;
  /** Hold to unlock (default). false: tap twice instead. */
  hold_to_unlock?: boolean;
  /** Hold time in ms. Default 800. */
  hold_time?: number;
  /** Show the "ドアを開ける" button when the lock can unlatch the door. Default true. */
  show_open?: boolean;
  /** Fixed PIN sent with every command. Leave out to type it on the card's keypad. */
  code?: string;
}

// LockEntityFeature.OPEN
const SUPPORT_OPEN = 1;

type Phase = 'locked' | 'unlocked' | 'open' | 'moving' | 'jammed' | 'off';

const LABEL: Record<string, string> = {
  locked: '施錠中',
  unlocked: '解錠中',
  open: 'ドアが開いています',
  opening: 'ドアを開けています',
  locking: '施錠しています',
  unlocking: '解錠しています',
  jammed: '動作不良',
  unavailable: '利用不可',
  unknown: '不明',
};

const PHASE_ACCENT: Record<Phase, Accent | 'neutral'> = {
  locked: 'green',
  unlocked: 'peach',
  open: 'peach',
  moving: 'yellow',
  jammed: 'red',
  off: 'neutral',
};

function phaseOf(s: HassEntity | undefined): Phase {
  switch (s?.state) {
    case 'locked':
      return 'locked';
    case 'unlocked':
      return 'unlocked';
    case 'open':
      return 'open';
    case 'locking':
    case 'unlocking':
    case 'opening':
      return 'moving';
    case 'jammed':
      return 'jammed';
    default:
      return 'off';
  }
}

type Pending = { service: 'lock' | 'unlock' | 'open' } | undefined;

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A single lock: a large button that locks with one tap and unlocks with a
 * press-and-hold (or a second tap), an optional "open the door" button, a
 * keypad when the lock wants a PIN, and chips for the door, battery and who
 * operated it last.
 *
 * Motion: holding fills a ring around the lock on a linear clock, and letting
 * go early springs it back (fast spatial); when it completes the shape morphs
 * circle → cookie and turns while the lock is moving; colours cross-fade on
 * the effects spring; a jammed lock shakes once; the keypad unfolds on the
 * default spatial spring and shakes on a wrong PIN.
 *
 * `layout: compact` is a single row (1 grid row) for listing locks under a
 * heading: shape, name and state, and a 施錠 / 解錠 button. Unlocking takes a
 * second tap within 3 s; a lock that wants a PIN opens HA's dialog instead.
 */
export class M3eLockCard extends M3eBaseCard<LockCardConfig> {
  static override accentHint = '暗証番号のテンキーの決定ボタンの色を変えます。施錠・解錠などの状態を表す色は変わりません。';

  @state() private hold = 0;
  @state() private holding = false;
  @state() private confirm?: 'unlock' | 'open';
  @state() private pending: Pending;
  @state() private pin = '';
  @state() private error = '';
  @state() private now = Date.now();
  private holdRaf = 0;
  private holdStart = 0;
  private release = new SpringValue(0, SPRINGS.spatialFast, (v) => (this.hold = Math.max(0, v)));
  private confirmTimer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  private lastPhase?: Phase;

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
      .text {
        flex: 1;
        min-width: 0;
      }
      .name {
        font: 500 16px / 24px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sub {
        font: 400 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .header m3e-icon {
        color: var(--m3-on-surface-variant);
      }

      /* the big lock button */
      .control {
        all: unset;
        box-sizing: border-box;
        position: relative;
        display: flex;
        align-items: center;
        gap: 20px;
        min-height: 128px;
        padding: 20px 24px 20px 20px;
        border-radius: 28px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        cursor: pointer;
        user-select: none;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default),
          border-radius var(--m3e-spatial-fast),
          transform var(--m3e-spatial-fast);
      }
      .control:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .control.holding {
        border-radius: 40px;
        transform: scale(0.98);
      }
      .control[aria-disabled='true'] {
        cursor: default;
      }
      .control[data-accent='neutral'] {
        background: var(--m3-surface-high);
      }
      .dial {
        position: relative;
        flex: none;
        width: 92px;
        height: 92px;
        display: grid;
        place-items: center;
      }
      .dial m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        --m3e-icon-size: 32px;
      }
      .dial svg {
        position: absolute;
        inset: 0;
        overflow: visible;
        transform: rotate(-90deg);
        pointer-events: none;
      }
      .ring {
        fill: none;
        stroke: var(--accent-fill);
        stroke-width: 4;
        stroke-linecap: round;
      }
      .ring-track {
        fill: none;
        stroke: color-mix(in srgb, var(--accent-fill) 22%, transparent);
        stroke-width: 4;
        opacity: 0;
        transition: opacity var(--m3e-effects-fast);
      }
      .holding .ring-track,
      .confirm .ring-track {
        opacity: 1;
      }
      .big {
        font: 600 22px / 30px var(--m3e-font-plain);
      }
      .hint {
        margin-top: 2px;
        font: 400 13px / 18px var(--m3e-font-plain);
        opacity: 0.85;
      }
      .shake {
        animation: shake 420ms;
      }
      @keyframes shake {
        0%,
        100% {
          transform: translateX(0);
        }
        20% {
          transform: translateX(-8px);
        }
        40% {
          transform: translateX(7px);
        }
        60% {
          transform: translateX(-5px);
        }
        80% {
          transform: translateX(3px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .shake {
          animation: none;
        }
      }

      /* open (unlatch) */
      .open-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 48px;
        border-radius: 24px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 15px / 1 var(--m3e-font-plain);
      }
      .open-btn:active {
        border-radius: 14px;
        transform: none;
      }
      .open-btn.confirm {
        background: var(--acc-peach);
        color: var(--acc-on-peach);
      }
      .open-btn[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }
      .open-btn m3e-icon {
        --m3e-icon-size: 20px;
      }

      /* keypad */
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
      .pad {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: 24px;
        background: var(--m3-surface-high);
      }
      .pad-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .pad-head .err {
        color: var(--acc-red);
        font-weight: 400;
        font-size: 13px;
      }
      .dots {
        display: flex;
        justify-content: center;
        gap: 12px;
        height: 16px;
      }
      .dots i {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        box-shadow: inset 0 0 0 2px var(--m3-outline);
        transition:
          background-color var(--m3e-effects-fast),
          box-shadow var(--m3e-effects-fast),
          transform var(--m3e-spatial-fast);
      }
      .dots i.on {
        background: var(--m3-on-surface);
        box-shadow: none;
        transform: scale(1.15);
      }
      .keys {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .key {
        height: 52px;
        border-radius: 16px;
        background: var(--m3-surface-highest);
        color: var(--m3-on-surface);
        font: 500 22px / 1 var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .key:active {
        border-radius: 26px;
        transform: none;
      }
      .key.small {
        font: 500 14px / 1 var(--m3e-font-plain);
      }
      .key.go {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .key[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }

      /* chips */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px 0 10px;
        border-radius: 16px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 400 13px / 1 var(--m3e-font-plain);
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .chip m3e-icon {
        --m3e-icon-size: 18px;
        color: var(--m3-on-surface-variant);
      }
      .chip.warn {
        background: var(--acc-peach-container);
        color: var(--acc-on-peach-container);
      }
      .chip.warn m3e-icon {
        color: inherit;
      }
      .chip.static {
        cursor: default;
      }

      /* ── compact layout: the whole card is one row ── */
      /* Fill the grid row HA gives the card (56px) in either density; full stays auto-height. */
      :host {
        height: 100%;
      }
      .card.row {
        height: 100%;
        flex-direction: row;
        align-items: center;
        gap: 14px;
        padding: 8px 8px 8px 12px;
      }
      .row m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        cursor: pointer;
      }
      [data-accent='neutral'].row m3e-shape {
        --m3e-shape-color: var(--m3-surface-highest);
        color: var(--m3-on-surface-variant);
      }
      .row .text {
        cursor: pointer;
      }
      .row .name {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      .row .sub {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row .sub .err {
        color: var(--acc-red);
      }
      .lock-btn {
        display: inline-flex;
        gap: 6px;
        height: 40px;
        padding: 0 16px 0 12px;
        border-radius: 20px;
        box-shadow: inset 0 0 0 1px var(--m3-outline);
        color: var(--m3-on-surface);
        font: 500 14px / 1 var(--m3e-font-plain);
      }
      .lock-btn m3e-icon {
        --m3e-icon-size: 20px;
      }
      .lock-btn:active {
        border-radius: 12px;
      }
      .lock-btn.confirm {
        background: var(--acc-red);
        color: var(--acc-on-red);
        box-shadow: none;
      }
      .lock-btn[disabled] {
        opacity: 0.38;
        pointer-events: none;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .card.row {
        padding: 6px 8px 6px 10px;
        gap: 10px;
      }
      :host([compact]) .lock-btn {
        height: 36px;
        padding: 0 14px 0 10px;
        font: 500 13px / 1 var(--m3e-font-plain);
      }
      :host([compact]) .name {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .control {
        gap: 14px;
        min-height: 96px;
        padding: 12px 18px 12px 12px;
        border-radius: 24px;
      }
      :host([compact]) .control.holding {
        border-radius: 36px;
      }
      :host([compact]) .dial {
        width: 72px;
        height: 72px;
      }
      :host([compact]) .dial svg {
        width: 100%;
        height: 100%;
      }
      :host([compact]) .dial m3e-shape {
        --m3e-icon-size: 26px;
      }
      :host([compact]) .big {
        font: 600 18px / 26px var(--m3e-font-plain);
      }
      :host([compact]) .hint {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .open-btn {
        height: 40px;
        border-radius: 20px;
        font: 500 14px / 1 var(--m3e-font-plain);
      }
      :host([compact]) .fold {
        margin-top: -12px;
      }
      :host([compact]) .fold.open {
        margin-top: 0;
      }
      :host([compact]) .pad {
        padding: 12px;
        gap: 10px;
        border-radius: 20px;
      }
      :host([compact]) .key {
        height: 44px;
        border-radius: 14px;
        font-size: 20px;
      }
      :host([compact]) .key:active {
        border-radius: 22px;
      }
      :host([compact]) .chips {
        gap: 6px;
        flex-wrap: wrap;
      }
      :host([compact]) .chip {
        height: 28px;
        padding: 0 10px 0 8px;
        font-size: 12px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('lock.')) ?? 'lock.example';
    return { type: 'custom:m3e-lock-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'lock' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'layout', selector: { select: { options: ['full', 'compact'] } } },
        { name: 'door_entity', selector: { entity: { domain: 'binary_sensor' } } },
        { name: 'battery_entity', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        { name: 'hold_to_unlock', default: true, selector: { boolean: {} } },
        { name: 'show_open', default: true, selector: { boolean: {} } },
      ],
    };
  }

  protected normalizeConfig(config: LockCardConfig): LockCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (!config.entity.startsWith('lock.')) throw new Error('entity must be a lock');
    if (config.layout && !['full', 'compact'].includes(config.layout)) throw new Error('layout must be full or compact');
    return config;
  }

  private get isRow(): boolean {
    return this.config.layout === 'compact';
  }

  protected watchedEntities(): string[] {
    if (this.isRow) return [this.config.entity];
    return [this.config.entity, this.config.door_entity, this.config.battery_entity].filter(Boolean) as string[];
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.isRow ? { columns: 12, rows: 1, min_columns: 6 } : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.isRow ? 1 : 4;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Keeps "3分前" fresh.
    this.clock = setInterval(() => (this.now = Date.now()), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.clock);
    cancelAnimationFrame(this.holdRaf);
    this.release.stop();
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const phase = phaseOf(this.stateObj(this.config.entity));
    if (phase !== this.lastPhase) {
      if (phase === 'jammed' && this.lastPhase) this.shake('.control');
      // The command went through: let the ring go.
      if (this.lastPhase && phase !== 'moving') this.dropRing();
      this.lastPhase = phase;
    }
  }

  /** Spring the hold ring back to empty from wherever it is. */
  private dropRing(): void {
    if (this.hold <= 0) return;
    this.release.value = this.hold;
    this.release.velocity = 0;
    this.release.set(0);
  }

  private shake(selector: string): void {
    const el = this.renderRoot.querySelector(selector);
    if (!el) return;
    el.classList.remove('shake');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('shake');
  }

  private needsCode(): boolean {
    const s = this.stateObj(this.config.entity);
    return !!s?.attributes.code_format && !this.config.code;
  }

  private numericCode(): boolean {
    const fmt = String(this.stateObj(this.config.entity)?.attributes.code_format ?? '');
    return fmt === 'number' || /\\d|\[0-9\]/.test(fmt);
  }

  /** Run a command now, or ask for the PIN first. */
  private request(service: 'lock' | 'unlock' | 'open'): void {
    this.error = '';
    if (this.needsCode()) {
      this.pending = { service };
      this.pin = '';
      return;
    }
    this.send(service, this.config.code);
  }

  private async send(service: 'lock' | 'unlock' | 'open', code?: string): Promise<void> {
    try {
      await this.hass?.callService('lock', service, code ? { code } : {}, { entity_id: this.config.entity });
      this.pending = undefined;
      this.pin = '';
    } catch (e) {
      this.dropRing();
      this.error = (e as Error)?.message || '操作できませんでした';
      if (this.pending) {
        this.pin = '';
        this.shake('.pad');
      }
    }
  }

  // ── hold to unlock ────────────────────────────────────────

  private get holdTime(): number {
    return this.config.hold_time ?? 800;
  }

  private startHold(): void {
    this.holding = true;
    this.release.stop();
    const from = this.hold;
    this.holdStart = performance.now() - from * this.holdTime;
    const tick = (now: number) => {
      const p = Math.min(1, (now - this.holdStart) / this.holdTime);
      this.hold = p;
      if (p >= 1) {
        this.holding = false;
        this.holdRaf = 0;
        navigator.vibrate?.(20);
        this.request('unlock');
        return;
      }
      this.holdRaf = requestAnimationFrame(tick);
    };
    if (prefersReducedMotion()) {
      // Still a deliberate hold, just without the animated ring.
      this.holdRaf = window.setTimeout(() => tick(performance.now() + this.holdTime), this.holdTime) as unknown as number;
      return;
    }
    this.holdRaf = requestAnimationFrame(tick);
  }

  private cancelHold(): void {
    if (!this.holding) return;
    this.holding = false;
    cancelAnimationFrame(this.holdRaf);
    clearTimeout(this.holdRaf);
    this.holdRaf = 0;
    this.dropRing();
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const phase = phaseOf(this.stateObj(this.config.entity));
    if (phase !== 'locked' || this.config.hold_to_unlock === false || this.pending) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; the hold still works until pointerup / leave.
    }
    this.startHold();
  };

  private onUp = (): void => this.cancelHold();

  private onClick = (): void => {
    const phase = phaseOf(this.stateObj(this.config.entity));
    if (phase === 'unlocked' || phase === 'open' || phase === 'jammed') {
      this.request('lock');
      return;
    }
    if (phase === 'locked' && this.config.hold_to_unlock === false) {
      if (this.confirm === 'unlock') {
        this.clearConfirm();
        this.request('unlock');
      } else this.armConfirm('unlock');
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const phase = phaseOf(this.stateObj(this.config.entity));
    if (phase === 'locked' && this.config.hold_to_unlock !== false) {
      if (!e.repeat && !this.holding) this.startHold();
    } else if (!e.repeat) this.onClick();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') this.cancelHold();
  };

  private armConfirm(what: 'unlock' | 'open'): void {
    this.confirm = what;
    clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => (this.confirm = undefined), 3000);
  }

  private clearConfirm(): void {
    clearTimeout(this.confirmTimer);
    this.confirm = undefined;
  }

  private onOpen(): void {
    if (this.confirm === 'open') {
      this.clearConfirm();
      this.request('open');
    } else this.armConfirm('open');
  }

  // ── keypad ────────────────────────────────────────────────

  private press(k: string): void {
    this.error = '';
    if (k === 'clear') this.pin = this.pin.slice(0, -1);
    else if (this.pin.length < 12) this.pin += k;
  }

  private submit(): void {
    if (!this.pending || !this.pin) return;
    this.send(this.pending.service, this.pin);
  }

  private cancelPad(): void {
    this.pending = undefined;
    this.pin = '';
    this.error = '';
    this.dropRing();
  }

  private renderPad() {
    const open = !!this.pending;
    const verb = this.pending?.service === 'lock' ? '施錠' : this.pending?.service === 'open' ? 'ドアを開ける' : '解錠';
    const numeric = this.numericCode();
    return html`<div class="fold ${open ? 'open' : ''}" ?inert=${!open}>
      <div>
        <div class="pad" data-accent=${this.config.color ?? 'green'} @keydown=${(e: KeyboardEvent) => {
          if (/^\d$/.test(e.key)) this.press(e.key);
          else if (e.key === 'Backspace') this.press('clear');
          else if (e.key === 'Enter') this.submit();
          else if (e.key === 'Escape') this.cancelPad();
        }}>
          <div class="pad-head">
            <span>${verb}の暗証番号</span>
            ${this.error ? html`<span class="err" role="alert">${this.error}</span>` : nothing}
          </div>
          ${numeric
            ? html`<div class="dots" aria-label="${this.pin.length}桁入力済み">
                  ${Array.from({ length: Math.max(4, this.pin.length) }, (_, i) => html`<i class=${i < this.pin.length ? 'on' : ''}></i>`)}
                </div>
                <div class="keys">
                  ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
                    (k) => html`<button class="icon-btn key" @click=${() => this.press(k)}>${k}</button>`,
                  )}
                  <button class="icon-btn key small" @click=${this.cancelPad}>やめる</button>
                  <button class="icon-btn key" @click=${() => this.press('0')}>0</button>
                  ${this.pin
                    ? html`<button class="icon-btn key go" aria-label=${verb} @click=${this.submit}><m3e-icon icon="check"></m3e-icon></button>`
                    : html`<button class="icon-btn key small" disabled>${verb}</button>`}
                </div>
                ${this.pin ? html`<button class="icon-btn key small" style="height:36px" @click=${() => this.press('clear')}>1文字消す</button>` : nothing}`
            : html`<input
                  type="password"
                  autocomplete="off"
                  .value=${this.pin}
                  @input=${(e: InputEvent) => (this.pin = (e.target as HTMLInputElement).value)}
                  style="height:44px;border-radius:12px;border:1px solid var(--m3-outline);padding:0 12px;font:inherit;background:var(--m3-surface-container);color:var(--m3-on-surface)"
                />
                <div class="keys">
                  <button class="icon-btn key small" @click=${this.cancelPad}>やめる</button>
                  <span></span>
                  <button class="icon-btn key go small" ?disabled=${!this.pin} @click=${this.submit}>${verb}</button>
                </div>`}
        </div>
      </div>
    </div>`;
  }

  // ── render ────────────────────────────────────────────────

  private chips(s: HassEntity | undefined) {
    const out = [];
    const door = this.stateObj(this.config.door_entity);
    if (door) {
      const open = door.state === 'on';
      out.push(html`<span class="chip ${open ? 'warn' : ''}" role="button" @click=${() => this.moreInfo(door.entity_id)}>
        <m3e-icon icon="door-front"></m3e-icon>ドア ${isUnavailable(door) ? '不明' : open ? '開' : '閉'}
      </span>`);
    }
    const bat = this.stateObj(this.config.battery_entity);
    const level = numState(bat);
    if (bat) {
      out.push(html`<span class="chip ${level !== undefined && level <= 20 ? 'warn' : ''}" role="button" @click=${() => this.moreInfo(bat.entity_id)}>
        <m3e-icon icon="battery-full"></m3e-icon>電池 ${level === undefined ? '—' : `${Math.round(level)}%`}
      </span>`);
    }
    const by = s?.attributes.changed_by as string | undefined;
    if (by) {
      out.push(html`<span class="chip static"><m3e-icon icon="person"></m3e-icon>${by}</span>`);
    }
    return out.length ? html`<div class="chips">${out}</div>` : nothing;
  }

  private hint(phase: Phase): string {
    if (this.pending) return '暗証番号を入力してください';
    if (phase === 'locked') {
      if (this.config.hold_to_unlock === false) return this.confirm === 'unlock' ? 'もう一度タップで解錠' : 'タップで解錠';
      return this.holding ? 'そのまま押し続けてください' : '長押しで解錠';
    }
    if (phase === 'unlocked' || phase === 'open') return 'タップで施錠';
    if (phase === 'jammed') return 'タップでもう一度施錠';
    if (phase === 'moving') return 'しばらくお待ちください';
    return '';
  }

  /** compact: lock with one tap, unlock with a second tap; a PIN lock opens HA's dialog. */
  private onRowButton = (): void => {
    if (this.needsCode()) {
      this.moreInfo(this.config.entity);
      return;
    }
    if (phaseOf(this.stateObj(this.config.entity)) !== 'locked') {
      this.request('lock');
    } else if (this.confirm === 'unlock') {
      this.clearConfirm();
      this.request('unlock');
    } else this.armConfirm('unlock');
  };

  private renderCompact(s: HassEntity | undefined, phase: Phase, name: string) {
    const locked = phase === 'locked';
    const confirm = this.confirm === 'unlock';
    const when = s && !isUnavailable(s) ? `・${hhmm(s.last_changed)}` : '';
    const label = LABEL[s?.state ?? ''] ?? (s ? s.state : '見つかりません');
    return html`<div class="card row ${phase === 'off' ? 'unavailable' : ''}" data-accent=${PHASE_ACCENT[phase]}>
      <m3e-shape
        .shape=${locked ? 'circle' : phase === 'jammed' ? 'burst8' : 'cookie9'}
        size=${this.compact ? 36 : 40}
        ?spin=${phase === 'moving'}
        @click=${() => this.moreInfo(this.config.entity)}
      >
        <m3e-icon .icon=${locked || s?.state === 'locking' ? 'lock' : 'lock-open-right'}></m3e-icon>
      </m3e-shape>
      <div class="text" @click=${() => this.moreInfo(this.config.entity)}>
        <p class="name">${name}</p>
        <p class="sub">${this.error ? html`<span class="err" role="alert">${this.error}</span>` : `${label}${when}`}</p>
      </div>
      <button
        class="icon-btn lock-btn ${confirm ? 'confirm' : ''}"
        ?disabled=${phase === 'off' || phase === 'moving'}
        aria-label=${locked ? (confirm ? `もう一度タップで${name}を解錠` : `${name}を解錠`) : `${name}を施錠`}
        @click=${this.onRowButton}
      >
        <m3e-icon .icon=${locked ? 'lock-open-right' : 'lock'}></m3e-icon>${locked ? (confirm ? 'もう一度で解錠' : '解錠') : '施錠'}
      </button>
    </div>`;
  }

  protected override render() {
    const s = this.stateObj(this.config.entity);
    const phase = phaseOf(s);
    const name = this.config.name ?? (s?.attributes.friendly_name as string) ?? this.config.entity;
    if (this.isRow) return this.renderCompact(s, phase, name);
    const disabled = phase === 'off' || phase === 'moving';
    const canOpen =
      this.config.show_open !== false && ((s?.attributes.supported_features ?? 0) & SUPPORT_OPEN) !== 0 && phase !== 'off';
    const since = s && !isUnavailable(s) ? `${hhmm(s.last_changed)}（${relativeTime(s.last_changed, this.now)}）` : '';
    const ring = phase === 'locked' ? this.hold : this.confirm === 'unlock' ? 1 : 0;
    return html`<div class="card ${phase === 'off' ? 'unavailable' : ''}">
      <div class="header" @click=${() => this.moreInfo(this.config.entity)}>
        <div class="text">
          <p class="name">${name}</p>
          <p class="sub">${since ? `${LABEL[s!.state] ?? s!.state}・${since}` : (LABEL[s?.state ?? ''] ?? '見つかりません')}</p>
        </div>
        <m3e-icon icon="more-horiz" aria-label="詳細"></m3e-icon>
      </div>

      <div
        class="control ${this.holding ? 'holding' : ''} ${this.confirm === 'unlock' ? 'confirm' : ''}"
        data-accent=${PHASE_ACCENT[phase]}
        role="button"
        tabindex=${disabled ? -1 : 0}
        aria-disabled=${disabled ? 'true' : 'false'}
        aria-label="${name}：${LABEL[s?.state ?? ''] ?? ''}。${this.hint(phase)}"
        @pointerdown=${disabled ? nothing : this.onDown}
        @pointerup=${this.onUp}
        @pointercancel=${this.onUp}
        @lostpointercapture=${this.onUp}
        @click=${disabled ? nothing : this.onClick}
        @keydown=${disabled ? nothing : this.onKeyDown}
        @keyup=${this.onKeyUp}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div class="dial">
          <svg viewBox="0 0 92 92" aria-hidden="true">
            <circle class="ring-track" cx="46" cy="46" r=${RING_R}></circle>
            ${ring > 0
              ? svg`<circle class="ring" cx="46" cy="46" r=${RING_R}
                  stroke-dasharray=${RING_C} stroke-dashoffset=${RING_C * (1 - ring)}></circle>`
              : nothing}
          </svg>
          <m3e-shape .shape=${phase === 'locked' ? 'circle' : phase === 'jammed' ? 'burst8' : 'cookie9'} size=${this.compact ? 56 : 72} ?spin=${phase === 'moving'}>
            <m3e-icon .icon=${phase === 'locked' || s?.state === 'locking' ? 'lock' : 'lock-open-right'}></m3e-icon>
          </m3e-shape>
        </div>
        <div>
          <p class="big">${LABEL[s?.state ?? ''] ?? '見つかりません'}</p>
          <p class="hint">${this.hint(phase)}</p>
        </div>
      </div>

      ${this.renderPad()}
      ${canOpen
        ? html`<button
            class="icon-btn open-btn ${this.confirm === 'open' ? 'confirm' : ''}"
            ?disabled=${phase === 'moving' || phase === 'open' || !!this.pending}
            @click=${this.onOpen}
          >
            <m3e-icon icon="door-front"></m3e-icon>${this.confirm === 'open' ? 'もう一度タップでドアを開ける' : 'ドアを開ける'}
          </button>`
        : nothing}
      ${this.error && !this.pending ? html`<p class="sub" role="alert" style="color:var(--acc-red)">${this.error}</p>` : nothing}
      ${this.chips(s)}
    </div>`;
  }
}

define('m3e-lock-card', M3eLockCard);
