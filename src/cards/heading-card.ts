import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { ACTION_LABELS, M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { checkEntity, checkOneOf, checkSummary, type Issue } from '../editor/validate';
import { loadCollapsed, readCollapsedSync, writeCollapsed, type CollapseMemory, type CollapseTarget } from '../ha/collapse-state';
import { fireHaptic } from '../ha/helpers';
import type { ActionConfig, LovelaceGridOptions } from '../ha/types';
import { formatSensor } from '../ha/format';
import { summaryEntities, summaryText, type Summary } from '../ha/summary';
import { define } from '../components/define';
import '../components/m3e-icon';

export interface HeadingActionConfig {
  name?: string;
  icon?: string;
  tap_action: ActionConfig;
}

export interface HeadingCardConfig extends BaseCardConfig {
  title: string;
  icon?: string;
  /** Sensors shown on the right, joined by " · " (e.g. temperature, humidity). `{entity, name}` adds a label: "浴室 24.5°". */
  entities?: (string | { entity: string; name?: string })[];
  /** Static text on the right instead of entities. */
  meta?: string;
  /** Live summary on the right, e.g. { type: count, entities: [...], state: open, text: '{n}か所が開', zero_text: すべて閉 }. */
  summary?: Summary;
  /** Navigates here when tapped (shorthand for tap_action: { action: navigate }). */
  navigation_path?: string;
  /** Allow collapsing subsequent cards until the next heading. */
  collapsible?: boolean;
  /** Initial collapsed state when no stored state exists. */
  default_collapsed?: boolean;
  /** Optional input_boolean/switch entity that stores collapsed state across devices. */
  collapse_entity?: string;
  /** Where to remember collapse state when `collapse_entity` is unset. Default `'device'`. */
  collapse_memory?: CollapseMemory;
  /** Optional quick action button shown on the right of the heading. */
  action?: HeadingActionConfig;
}

export { formatSensor };

const STORAGE_PREFIX = 'm3e-heading-collapsed';

/** Section heading: icon, title, quiet readings, optional quick action and section collapse. */
export class M3eHeadingCard extends M3eBaseCard<HeadingCardConfig> {
  static override accentHint = '見出しのアイコンの色を変えます。';

  @state() private collapsed = false;
  @state() private collapseUnavailable = false;
  private hiddenSiblings: HTMLElement[] = [];
  private syncedCollapseUserData = false;
  private collapseDirty = false;
  private rafId = 0;

  static override styles = [
    M3eBaseCard.styles,
    css`
      /* The heading fills its grid row and sits on the row's bottom edge, so it
         reads with the cards below it rather than the section above. */
      :host {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 100%;
      }
      .heading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 4px 4px;
        min-height: 36px;
        border-radius: 12px;
      }
      .heading:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      m3e-icon {
        color: var(--m3-on-surface-variant);
      }
      :host([data-accent]) m3e-icon {
        color: var(--accent-fill);
      }
      .title {
        flex: 1;
        min-width: 0;
        font: 500 18px / 26px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta {
        font: 500 15px / 22px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        white-space: pre;
        font-variant-numeric: tabular-nums;
      }
      .link {
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .action-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 28px;
        padding: 0 10px;
        border-radius: 14px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 12px / 1 var(--m3e-font-plain);
        --m3e-icon-size: 16px;
      }
      .action-btn:hover {
        background: var(--m3-surface-highest);
      }
      .action-btn m3e-icon {
        color: inherit;
      }
      .chevron {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 14px;
        color: var(--m3-on-surface-variant);
        --m3e-icon-size: 20px;
        transition:
          transform var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default);
      }
      .chevron m3e-icon {
        color: inherit;
        transition: transform var(--m3e-spatial-fast);
      }
      .chevron.collapsed m3e-icon {
        transform: rotate(-90deg);
      }
      button.chevron:hover {
        background: var(--m3-surface-high);
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .heading {
        padding: 4px 4px 0;
        min-height: 32px;
      }
      :host([compact]) m3e-icon {
        --m3e-icon-size: 20px;
      }
      :host([compact]) .title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      :host([compact]) .meta {
        font: 500 13px / 20px var(--m3e-font-brand);
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-heading-card', title: 'リビング', icon: 'chair' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', required: true, selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        {
          name: 'entities',
          selector: {
            object: {
              multiple: true,
              label_field: 'entity',
              description_field: 'name',
              fields: {
                entity: { label: 'エンティティ', required: true, selector: { entity: {} } },
                name: { label: '名前（値の前に付ける）', selector: { text: {} } },
              },
            },
          },
        },
        { name: 'meta', selector: { text: {} } },
        { name: 'collapsible', default: false, selector: { boolean: {} } },
        { name: 'default_collapsed', default: false, selector: { boolean: {} } },
        {
          name: 'collapse_memory',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'device', label: 'この端末に保存' },
                { value: 'user', label: 'ユーザーに保存（端末間で同期）' },
                { value: 'session', label: 'このセッションのみ' },
              ],
            },
          },
        },
        { name: 'collapse_entity', selector: { entity: { domain: ['input_boolean', 'switch'] } } },
        { name: 'navigation_path', selector: { navigation: {} } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      // The list editor works on objects: "sensor.x" becomes { entity: sensor.x }.
      toForm: (c: Record<string, unknown>) => ({
        ...c,
        entities: Array.isArray(c.entities) ? c.entities.map((e) => (typeof e === 'string' ? { entity: e } : e)) : c.entities,
      }),
      computeLabel: (s: { name: string }) =>
        ({
          title: 'タイトル',
          icon: 'アイコン',
          entities: '右側に出す値',
          meta: '右側の文言（固定）',
          collapsible: '配下のカードを折りたたみ可能にする',
          default_collapsed: '最初から折りたたむ',
          collapse_memory: '折りたたみ状態の保存先',
          collapse_entity: '折りたたみ状態と連動するエンティティ',
          navigation_path: 'タップで開くページ',
          ...ACTION_LABELS,
        })[s.name],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    const out = [
      ...checkSummary(c, 'summary', '右側の要約'),
      ...checkOneOf(c, 'collapse_memory', ['user', 'device', 'session'], '折りたたみ状態の保存先'),
      ...checkEntity(c, 'collapse_entity', ['input_boolean', 'switch'], '折りたたみ状態のエンティティ'),
    ];
    if (c.action !== undefined) {
      const a = c.action as { tap_action?: { action?: unknown } } | null;
      if (!a || typeof a !== 'object' || !a.tap_action || typeof a.tap_action !== 'object' || typeof a.tap_action.action !== 'string') {
        out.push({
          path: 'action',
          level: 'error',
          message: 'action must define tap_action: { action: ... }',
          hint: 'action には { tap_action: { action: perform-action, ... } } の形で指定してください',
        });
      }
    }
    return out;
  }

  protected normalizeConfig(config: HeadingCardConfig): HeadingCardConfig {
    if (!config.title) throw new Error('title is required');
    this.collapsed = readCollapsedSync(this.hass, this.collapseTarget(config));
    return config;
  }

  private entityIds(): string[] {
    return (this.config.entities ?? []).map((e) => (typeof e === 'string' ? e : e.entity));
  }

  protected watchedEntities(): string[] {
    return [...this.entityIds(), this.config.collapse_entity, ...(this.config.summary ? summaryEntities(this.hass, this.config.summary) : [])].filter(
      Boolean,
    ) as string[];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 'full', rows: 'auto' };
  }

  override getCardSize(): number {
    return 1;
  }

  private collapseTarget(cfg: HeadingCardConfig = this.config): CollapseTarget {
    const path = typeof location !== 'undefined' ? location.pathname : '';
    return {
      entity: cfg.collapse_entity,
      storageKey: `${STORAGE_PREFIX}:${path}:${cfg.title ?? ''}`,
      defaultCollapsed: cfg.default_collapsed,
      memory: cfg.collapse_memory ?? 'device',
    };
  }

  private gridItem(): HTMLElement | undefined {
    let node: HTMLElement | null = this;
    for (let depth = 0; depth < 6 && node; depth++) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) return undefined;
      if (
        parent.classList.contains('container') ||
        parent.classList.contains('column') ||
        parent.classList.contains('section') ||
        parent.id === 'root'
      ) {
        return node;
      }
      node = parent;
    }
    return undefined;
  }

  private isEditing(): boolean {
    const self = this as unknown as { editMode?: boolean; preview?: boolean };
    if (self.editMode || self.preview) return true;
    const wrapper = this.parentElement as unknown as { editMode?: boolean; preview?: boolean } | null;
    return !!(wrapper?.editMode || wrapper?.preview);
  }

  private restoreHidden(): void {
    for (const el of this.hiddenSiblings) el.style.removeProperty('display');
    this.hiddenSiblings = [];
  }

  private applyCollapse(): void {
    this.restoreHidden();
    if (!this.config?.collapsible || !this.collapsed || this.isEditing()) return;
    const start = this.gridItem();
    if (!start) return;
    for (let el = start.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.matches('m3e-heading-card, hui-heading-card') || el.querySelector('m3e-heading-card, hui-heading-card')) break;
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = 'none';
      this.hiddenSiblings.push(htmlEl);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        if (!this.isConnected || !this.config) return;
        this.collapseUnavailable = !!this.config.collapsible && !this.gridItem();
        this.applyCollapse();
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.syncedCollapseUserData = false;
    this.collapseDirty = false;
    this.restoreHidden();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.config) return;
    if (this.config.collapsible) {
      this.collapseUnavailable = !this.gridItem();
    } else {
      this.collapseUnavailable = false;
    }
    if (this.config.collapse_entity) {
      const wanted = readCollapsedSync(this.hass, this.collapseTarget());
      if (wanted !== this.collapsed) this.collapsed = wanted;
    } else if (this.config.collapse_memory === 'user' && this.hass && !this.syncedCollapseUserData) {
      this.syncedCollapseUserData = true;
      void loadCollapsed(this.hass, this.collapseTarget()).then((remote) => {
        if (!this.isConnected || this.collapseDirty || remote === undefined || remote === this.collapsed) return;
        this.collapsed = remote;
      });
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.applyCollapse();
  }

  private toggleCollapse(e?: Event): void {
    e?.stopPropagation();
    const next = !this.collapsed;
    this.collapsed = next;
    this.collapseDirty = true;
    fireHaptic(this, 'selection');
    writeCollapsed(this.hass, this.collapseTarget(), next);
    this.applyCollapse();
  }

  private hasExplicitLink(): boolean {
    if (this.config.tap_action) return this.config.tap_action.action !== 'none';
    return !!(this.config.navigation_path || this.config.entities?.length);
  }

  private tap(): void {
    if (this.config.tap_action) {
      this.runAction(this.config.tap_action, this.entityIds()[0]);
    } else if (this.config.navigation_path) {
      history.pushState(null, '', this.config.navigation_path);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    } else if (this.entityIds().length) {
      this.moreInfo(this.entityIds()[0]);
    } else if (this.config.collapsible && !this.collapseUnavailable) {
      this.toggleCollapse();
    }
  }

  private runQuickAction(e: Event): void {
    e.stopPropagation();
    const a = this.config.action;
    if (!a) return;
    fireHaptic(this, 'light');
    this.runAction(a.tap_action, this.entityIds()[0]);
  }

  protected renderCard() {
    const readings = (this.config.entities ?? []).map((e) =>
      typeof e === 'string' ? formatSensor(this.stateObj(e), this.hass) : `${e.name ? `${e.name} ` : ''}${formatSensor(this.stateObj(e.entity), this.hass)}`,
    );
    const meta = this.config.meta ?? (this.config.summary ? summaryText(this.hass, this.config.summary) : readings.join('  ·  '));
    const canCollapse = !!this.config.collapsible && !this.collapseUnavailable;
    const explicitLink = this.hasExplicitLink();
    const rowInteractive = explicitLink || canCollapse;
    const rowTogglesCollapse = canCollapse && !explicitLink;
    const action = this.config.action;
    return html`<div
      class="heading ${rowInteractive ? 'link' : ''}"
      role=${rowInteractive ? 'button' : nothing}
      tabindex=${rowInteractive ? '0' : nothing}
      aria-expanded=${rowTogglesCollapse ? (this.collapsed ? 'false' : 'true') : nothing}
      @click=${rowInteractive ? this.tap : nothing}
      @keydown=${rowInteractive
        ? (e: KeyboardEvent) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              this.tap();
            }
          }
        : nothing}
    >
      ${this.config.icon ? html`<m3e-icon .icon=${this.config.icon}></m3e-icon>` : nothing}
      <span class="title" role="heading" aria-level="2">${this.config.title}</span>
      ${meta ? html`<span class="meta">${meta}</span>` : nothing}
      ${action
        ? html`<button class="icon-btn action-btn" aria-label=${action.name ?? '操作'} @click=${this.runQuickAction}>
            ${action.icon ? html`<m3e-icon .icon=${action.icon}></m3e-icon>` : nothing}${action.name ? html`<span>${action.name}</span>` : nothing}
          </button>`
        : nothing}
      ${canCollapse
        ? explicitLink
          ? html`<button
              class="icon-btn chevron ${this.collapsed ? 'collapsed' : ''}"
              aria-expanded=${this.collapsed ? 'false' : 'true'}
              aria-label=${this.collapsed ? `${this.config.title}を展開` : `${this.config.title}を折りたたむ`}
              @click=${(e: Event) => this.toggleCollapse(e)}
            >
              <m3e-icon icon="keyboard-arrow-down"></m3e-icon>
            </button>`
          : html`<span class="chevron ${this.collapsed ? 'collapsed' : ''}" aria-hidden="true">
              <m3e-icon icon="keyboard-arrow-down"></m3e-icon>
            </span>`
        : nothing}
    </div>`;
  }
}

define('m3e-heading-card', M3eHeadingCard);
