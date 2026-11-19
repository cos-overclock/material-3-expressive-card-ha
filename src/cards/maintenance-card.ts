import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { checkNumber, type Issue } from '../editor/validate';
import {
  collectUnavailable,
  isMuted,
  MUTE_OPTIONS,
  pruneMutes,
  type MuteEntry,
  type MuteMap,
  type MuteOption,
  type OfflineItem,
} from '../ha/availability';
import { domainOf, entityIdsOfDomain, fireHaptic, numState } from '../ha/helpers';
import { fetchUnavailableSince, formatOfflineDuration, type OfflineSince } from '../ha/state-since';
import { loadUserData, readLocal, saveUserData } from '../ha/user-data';
import type { HassEntity, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import { showSnackbar } from '../components/m3e-snackbar';
import '../components/m3e-shape';
import '../components/m3e-icon';

export interface MaintenanceCardConfig extends BaseCardConfig {
  title?: string;
  /** Batteries at or below this % are listed. Default 20. */
  battery_threshold?: number;
  show_batteries?: boolean;
  /** update.* entities with an update available. Default true. */
  show_updates?: boolean;
  /** Entities / devices that are unavailable. Default true. */
  show_unavailable?: boolean;
  /** Group unavailable entities by HA device (1 row per offline device). Default true. */
  group_by_device?: boolean;
  /** Hours offline before an item turns red (critical). Default 24. */
  critical_hours?: number;
  /** Default mute duration (hours) when tapping the bell button. Default 24. */
  mute_default_hours?: number;
  /** Leave out entities whose id matches one of these (`*` wildcards: sensor.*_rssi). */
  exclude?: string[];
  /** Rows per section before "ほか N件". Default 5. */
  max_items?: number;
}

interface Item {
  key?: string;
  entity: string;
  name: string;
  sub?: string;
  value: string;
  icon: string;
  tone?: 'alert' | 'warn';
  pct?: number;
  installable?: boolean;
}

// UpdateEntityFeature.INSTALL
const INSTALL = 1;
const MUTE_STORAGE_KEY = 'm3e_maintenance_mutes';
const SINCE_WINDOW_DAYS = 7;

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

function hasAnyState(states: Record<string, unknown> | undefined): boolean {
  for (const _ in states) return true;
  return false;
}

/**
 * What needs looking after: low batteries (with proportional fill bar),
 * devices with an update, and unreachable devices/entities (grouped by device,
 * restart-resistant offline duration, and per-device mute with Undo snackbar).
 */
export class M3eMaintenanceCard extends M3eBaseCard<MaintenanceCardConfig> {
  static override accentHint = 'すべて正常のときの色を変えます。';
  private excludeRe: RegExp[] = [];

  @state() private mutes: MuteMap = readLocal<MuteMap>(MUTE_STORAGE_KEY) ?? {};
  @state() private menuKey?: string;
  @state() private showMuted = false;
  @state() private sinceCache = new Map<string, OfflineSince>();
  private sincePending = new Set<string>();
  private syncedMutes = false;
  private mutesDirty = false;
  private trackedOffline = new Set<string>();
  private holdTimer?: ReturnType<typeof setTimeout>;
  private holdSuppressKey?: string;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .header m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .alerting .header m3e-shape {
        --m3e-shape-color: var(--acc-peach);
        color: var(--acc-on-peach);
      }
      .title {
        font: 500 16px / 22px var(--m3e-font-plain);
      }
      .summary {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      section {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      h3 {
        margin: 0 0 2px;
        font: 500 13px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .item {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        padding: 4px 8px 4px 10px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: border-radius var(--m3e-spatial-fast);
      }
      .item > * {
        position: relative;
        z-index: 1;
      }
      .item.battery::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--pct, 0%);
        background: color-mix(in srgb, var(--acc-peach) 22%, transparent);
        pointer-events: none;
        transition: width var(--m3e-effects-default);
      }
      .item.battery.alert::before {
        background: color-mix(in srgb, var(--acc-red) 24%, transparent);
      }
      .item:active {
        border-radius: 20px;
      }
      .item:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .item m3e-icon {
        --m3e-icon-size: 20px;
        color: var(--m3-on-surface-variant);
      }
      .item.alert m3e-icon {
        color: var(--acc-red);
      }
      .item.warn m3e-icon {
        color: var(--acc-peach);
      }
      .item .label-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .item .name {
        font: 500 14px / 20px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .item .sub {
        font: 400 11px / 15px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .item .value {
        font: 500 13px / 18px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .item.alert .value.dur {
        color: var(--acc-red);
      }
      .install {
        height: 32px;
        padding: 0 12px;
        border-radius: 16px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        font: 500 13px / 1 var(--m3e-font-plain);
      }
      .mute-btn {
        width: 32px;
        height: 32px;
        border-radius: 16px;
        color: var(--m3-on-surface-variant);
        --m3e-icon-size: 18px;
      }
      .mute-btn:hover {
        background: var(--m3-surface-highest);
        color: var(--m3-on-surface);
      }
      .mute-menu {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 12px;
        background: var(--m3-surface-bright);
      }
      .mute-opt {
        all: unset;
        box-sizing: border-box;
        height: 28px;
        padding: 0 10px;
        border-radius: 14px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        font: 500 12px / 1 var(--m3e-font-plain);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .mute-opt:hover {
        background: var(--m3-surface-highest);
      }
      .mute-opt:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .muted-foot {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .muted-chip {
        all: unset;
        box-sizing: border-box;
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px;
        border-radius: 15px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface-variant);
        font: 500 12px / 1 var(--m3e-font-plain);
        cursor: pointer;
        --m3e-icon-size: 16px;
      }
      .muted-chip:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .unmute {
        height: 28px;
        padding: 0 10px;
        border-radius: 14px;
        background: var(--m3-surface-highest);
        color: var(--m3-on-surface);
        font: 500 12px / 1 var(--m3e-font-plain);
      }
      .more {
        font: 400 12px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        padding-left: 10px;
      }
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .item {
        min-height: 44px;
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-maintenance-card' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'battery_threshold', selector: { number: { min: 1, max: 100, mode: 'box', unit_of_measurement: '%' } } },
        { name: 'show_batteries', default: true, selector: { boolean: {} } },
        { name: 'show_updates', default: true, selector: { boolean: {} } },
        { name: 'show_unavailable', default: true, selector: { boolean: {} } },
        { name: 'group_by_device', default: true, selector: { boolean: {} } },
        { name: 'critical_hours', selector: { number: { min: 1, max: 720, mode: 'box', unit_of_measurement: '時間' } } },
        { name: 'mute_default_hours', selector: { number: { min: 1, max: 720, mode: 'box', unit_of_measurement: '時間' } } },
        { name: 'max_items', selector: { number: { min: 1, max: 30, mode: 'box' } } },
        { name: 'exclude', selector: { text: { multiple: true } } },
      ],
      computeLabel: (s: { name: string }) =>
        ({
          battery_threshold: 'この残量以下を表示',
          show_batteries: '電池残量',
          show_updates: 'アップデート',
          show_unavailable: '利用できない機器',
          group_by_device: 'デバイス単位でまとめる',
          critical_hours: '赤表示にする経過時間',
          mute_default_hours: 'ミュートの既定時間',
          max_items: '1項目に出す件数',
          exclude: '除外するエンティティ（* が使える）',
        })[s.name],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    return [
      ...checkNumber(c, 'battery_threshold', { min: 1, max: 100, label: '電池残量のしきい値', unit: '%' }),
      ...checkNumber(c, 'max_items', { min: 1, max: 30, integer: true, label: '表示件数' }),
      ...checkNumber(c, 'critical_hours', { min: 1, max: 720, label: '赤表示までの時間', unit: '時間' }),
      ...checkNumber(c, 'mute_default_hours', { min: 1, max: 720, label: 'ミュート時間', unit: '時間' }),
    ];
  }

  protected normalizeConfig(config: MaintenanceCardConfig): MaintenanceCardConfig {
    this.excludeRe = (config.exclude ?? []).map(glob);
    return config;
  }

  /** Re-read the unavailable list once a minute. */
  protected override clockInterval(): number {
    return 60_000;
  }

  protected watchedEntities(): string[] {
    return [...this.batteryIds(), ...entityIdsOfDomain(this.hass, 'update'), ...this.trackedOffline];
  }

  protected override defaultAccent(): Accent {
    return 'green';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 4;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
    this.syncedMutes = false;
    this.mutesDirty = false;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.hass) return;
    if (!this.syncedMutes) {
      this.syncedMutes = true;
      void loadUserData<MuteMap>(this.hass, MUTE_STORAGE_KEY).then((remote) => {
        if (!this.isConnected || this.mutesDirty || !remote || typeof remote !== 'object') return;
        const offline = this.offlineKeySet();
        const { next } = hasAnyState(this.hass?.states) ? pruneMutes(remote, offline, this.clockNow) : { next: { ...remote } };
        this.mutes = next;
      });
    }
    if (this.config?.show_unavailable !== false && hasAnyState(this.hass.states)) {
      const offline = this.offlineKeySet();
      const { next, changed: pruned } = pruneMutes(this.mutes, offline, this.clockNow);
      if (pruned) {
        this.mutes = next;
        void saveUserData(this.hass, MUTE_STORAGE_KEY, next);
      }
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (this.config?.show_unavailable !== false && this.hass && hasAnyState(this.hass.states)) {
      this.syncSinceHistory();
    }
  }

  private offlineRaw(): OfflineItem[] {
    if (!this.hass || this.config?.show_unavailable === false) return [];
    const items = collectUnavailable(this.hass, { exclude: this.excludeRe, groupByDevice: this.config.group_by_device !== false });
    this.trackedOffline = new Set(items.map((i) => i.entity));
    return items;
  }

  private offlineKeySet(): Set<string> {
    return new Set(this.offlineRaw().map((u) => u.key));
  }

  private syncSinceHistory(): void {
    const items = this.offlineRaw();
    const activeKeys = new Set(items.map((i) => i.key));
    let cacheChanged = false;
    for (const k of this.sinceCache.keys()) {
      if (!activeKeys.has(k)) {
        this.sinceCache.delete(k);
        cacheChanged = true;
      }
    }
    const missing = items.filter((i) => !this.sinceCache.has(i.key) && !this.sincePending.has(i.entity));
    if (!missing.length) {
      if (cacheChanged) {
        void this.updateComplete.then(() => {
          if (this.isConnected) this.sinceCache = new Map(this.sinceCache);
        });
      }
      return;
    }
    const ids = missing.map((i) => i.entity);
    ids.forEach((id) => this.sincePending.add(id));
    void fetchUnavailableSince(this.hass, ids, SINCE_WINDOW_DAYS, Date.now()).then(async (map) => {
      ids.forEach((id) => this.sincePending.delete(id));
      await this.updateComplete;
      if (!this.isConnected) return;
      const next = new Map(this.sinceCache);
      for (const item of missing) {
        const res = map.get(item.entity);
        if (res) next.set(item.key, res);
      }
      this.sinceCache = next;
    });
  }

  private excluded(id: string): boolean {
    return this.excludeRe.some((re) => re.test(id));
  }

  private name(s: HassEntity): string {
    return (s.attributes.friendly_name as string | undefined) ?? s.entity_id;
  }

  private batteryIds(): string[] {
    const states = this.hass?.states ?? {};
    return [...entityIdsOfDomain(this.hass, 'sensor'), ...entityIdsOfDomain(this.hass, 'binary_sensor')].filter(
      (id) => states[id]?.attributes.device_class === 'battery',
    );
  }

  private batteries(): Item[] {
    const limit = this.config.battery_threshold ?? 20;
    const out: (Item & { level: number })[] = [];
    for (const id of this.batteryIds()) {
      if (this.excluded(id)) continue;
      const s = this.stateObj(id)!;
      if (domainOf(id) === 'binary_sensor') {
        if (s.state === 'on') out.push({ entity: id, name: this.name(s), value: '残量わずか', icon: 'battery-alert', tone: 'alert', pct: 8, level: 0 });
        continue;
      }
      const level = numState(s);
      if (level === undefined || level > limit) continue;
      const pct = Math.max(0, Math.min(100, Math.round(level)));
      out.push({
        entity: id,
        name: this.name(s),
        value: `${pct}%`,
        icon: level <= limit / 2 ? 'battery-alert' : 'battery-2-bar',
        tone: level <= limit / 2 ? 'alert' : 'warn',
        pct,
        level,
      });
    }
    return out.sort((a, b) => a.level - b.level);
  }

  private updates(): Item[] {
    return entityIdsOfDomain(this.hass, 'update')
      .filter((id) => !this.excluded(id))
      .map((id) => this.stateObj(id)!)
      .filter((s) => s.state === 'on')
      .map((s) => ({
        entity: s.entity_id,
        name: (s.attributes.title as string | undefined) ?? this.name(s),
        value: [s.attributes.installed_version, s.attributes.latest_version].filter(Boolean).join(' → '),
        icon: 'upgrade',
        installable: !!(Number(s.attributes.supported_features ?? 0) & INSTALL) && !s.attributes.in_progress,
      }));
  }

  private toOfflineItem(raw: OfflineItem): Item {
    const now = this.clockNow;
    const hist = this.sinceCache.get(raw.key);
    const sinceMs = hist?.at ?? raw.since;
    const older = !!hist?.older;
    const critMs = (this.config.critical_hours ?? 24) * 3_600_000;
    const critical = older || (Number.isFinite(sinceMs) && sinceMs > 0 && now - sinceMs >= critMs);
    const parts = [raw.area, raw.count > 1 ? `${raw.count}項目` : ''].filter(Boolean);
    return {
      key: raw.key,
      entity: raw.entity,
      name: raw.name,
      sub: parts.length ? parts.join('・') : undefined,
      value: formatOfflineDuration(sinceMs, now, { older, windowDays: SINCE_WINDOW_DAYS }),
      icon: 'link-off',
      tone: critical ? 'alert' : 'warn',
    };
  }

  private unavailablePartition(): { active: Item[]; muted: { key: string; entity?: string; name: string; entry: MuteEntry }[] } {
    const all = this.offlineRaw();
    const active: Item[] = [];
    const muted: { key: string; entity?: string; name: string; entry: MuteEntry }[] = [];
    const byKey = new Map<string, OfflineItem>();
    for (const raw of all) {
      byKey.set(raw.key, raw);
      const entry = this.mutes[raw.key];
      if (isMuted(entry, this.clockNow)) {
        muted.push({ key: raw.key, entity: raw.entity, name: raw.name, entry });
      } else {
        active.push(this.toOfflineItem(raw));
      }
    }
    for (const [key, entry] of Object.entries(this.mutes)) {
      if (entry.permanent && !byKey.has(key)) {
        const fallbackName = key.startsWith('device:') ? this.hass?.devices?.[key.slice(7)]?.name_by_user || this.hass?.devices?.[key.slice(7)]?.name || key : key.slice(7);
        muted.push({ key, name: fallbackName, entry });
      }
    }
    return { active, muted };
  }

  private applyMute(key: string, name: string, entry: MuteEntry, label: string): void {
    this.mutesDirty = true;
    const prev = this.mutes[key];
    this.mutes = { ...this.mutes, [key]: entry };
    this.menuKey = undefined;
    fireHaptic(this, 'selection');
    void saveUserData(this.hass, MUTE_STORAGE_KEY, this.mutes);
    showSnackbar({
      message: `${name}を${label}ミュートしました`,
      action: {
        label: '元に戻す',
        onAction: () => {
          this.mutesDirty = true;
          const next = { ...this.mutes };
          if (prev) next[key] = prev;
          else delete next[key];
          this.mutes = next;
          void saveUserData(this.hass, MUTE_STORAGE_KEY, next);
        },
      },
      theme: this.getAttribute('theme') === 'mocha' ? 'mocha' : 'latte',
    });
  }

  private muteDefault(item: Item): void {
    if (!item.key) return;
    if (this.holdSuppressKey === item.key) {
      this.holdSuppressKey = undefined;
      return;
    }
    const hours = this.config.mute_default_hours ?? 24;
    const now = Date.now();
    this.applyMute(item.key, item.name, { at: now, until: now + hours * 3_600_000 }, `${hours}時間`);
  }

  private muteWithOption(item: Item, opt: MuteOption): void {
    if (!item.key) return;
    const now = Date.now();
    const entry: MuteEntry = {
      at: now,
      until: opt.durationMs !== null ? now + opt.durationMs : null,
      permanent: opt.permanent,
    };
    this.applyMute(item.key, item.name, entry, opt.permanent ? 'ずっと' : opt.label);
  }

  private unmute(key: string): void {
    this.mutesDirty = true;
    const next = { ...this.mutes };
    delete next[key];
    this.mutes = next;
    fireHaptic(this, 'light');
    void saveUserData(this.hass, MUTE_STORAGE_KEY, next);
  }

  private install(e: Event, entity: string): void {
    e.stopPropagation();
    fireHaptic(this, 'success');
    this.call('update', 'install', {}, entity);
  }

  private startHold(key: string): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
      this.holdSuppressKey = key;
      this.menuKey = this.menuKey === key ? undefined : key;
      fireHaptic(this, 'medium');
    }, 500);
  }

  private clearHold(): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  private section(title: string, items: Item[], kind: 'battery' | 'update' | 'unavailable') {
    if (!items.length) return nothing;
    const max = this.config.max_items ?? 5;
    const canInstall = this.hass?.user?.is_admin !== false;
    return html`<section>
      <h3>${title}（${items.length}）</h3>
      ${items.slice(0, max).map(
        (it) => html`<div
            class="item ${kind === 'battery' ? 'battery' : ''} ${it.tone ?? ''}"
            style=${it.pct !== undefined ? `--pct:${it.pct}%` : ''}
            role="button"
            tabindex="0"
            @click=${() => this.moreInfo(it.entity)}
            @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && this.moreInfo(it.entity)}
          >
            <m3e-icon .icon=${it.icon}></m3e-icon>
            <span class="label-col">
              <span class="name">${it.name}</span>
              ${it.sub ? html`<span class="sub">${it.sub}</span>` : nothing}
            </span>
            ${it.value ? html`<span class="value ${kind === 'unavailable' ? 'dur' : ''}">${it.value}</span>` : nothing}
            ${it.installable && canInstall
              ? html`<button class="icon-btn install" @click=${(e: Event) => this.install(e, it.entity)}>更新</button>`
              : nothing}
            ${kind === 'unavailable' && it.key
              ? html`<button
                  class="icon-btn mute-btn"
                  aria-label="${it.name}をミュート"
                  aria-expanded=${this.menuKey === it.key ? 'true' : 'false'}
                  title="ミュート（長押し・右クリックで期間を選択）"
                  @pointerdown=${(e: PointerEvent) => {
                    e.stopPropagation();
                    if (e.button === 0) this.startHold(it.key!);
                  }}
                  @pointerup=${() => this.clearHold()}
                  @pointerleave=${() => this.clearHold()}
                  @pointercancel=${() => this.clearHold()}
                  @contextmenu=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.menuKey = this.menuKey === it.key ? undefined : it.key;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      this.menuKey = this.menuKey === it.key ? undefined : it.key;
                    }
                  }}
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.muteDefault(it);
                  }}
                >
                  <m3e-icon icon="mdi-bell"></m3e-icon>
                </button>`
              : nothing}
          </div>
          ${kind === 'unavailable' && it.key && this.menuKey === it.key
            ? html`<div class="mute-menu" role="group" aria-label="${it.name}のミュート期間">
                ${MUTE_OPTIONS.map(
                  (opt) => html`<button class="mute-opt" @click=${() => this.muteWithOption(it, opt)}>${opt.label}</button>`,
                )}
              </div>`
            : nothing}`,
      )}
      ${items.length > max ? html`<p class="more">ほか ${items.length - max}件</p>` : nothing}
    </section>`;
  }

  protected renderCard() {
    if (!this.hass) return nothing;
    const c = this.config;
    const batteries = c.show_batteries !== false ? this.batteries() : [];
    const updates = c.show_updates !== false ? this.updates() : [];
    const { active: unavailable, muted } = c.show_unavailable !== false ? this.unavailablePartition() : { active: [], muted: [] };
    const total = batteries.length + updates.length + unavailable.length;
    return html`<div class="card ${total ? 'alerting' : ''}">
      <div class="header">
        <m3e-shape .shape=${total ? 'burst8' : 'cookie9'} size=${this.compact ? 36 : 44}>
          <m3e-icon .icon=${total ? 'build' : 'check-circle'}></m3e-icon>
        </m3e-shape>
        <div>
          <p class="title">${c.title ?? 'メンテナンス'}</p>
          <p class="summary">${total ? `確認が必要なものが ${total}件あります` : 'すべて正常です'}</p>
        </div>
      </div>
      ${this.section('電池残量が少ない', batteries, 'battery')} ${this.section('アップデートがあります', updates, 'update')}
      ${this.section('利用できません', unavailable, 'unavailable')}
      ${muted.length
        ? html`<div class="muted-foot">
            <button class="muted-chip" aria-expanded=${this.showMuted ? 'true' : 'false'} @click=${() => (this.showMuted = !this.showMuted)}>
              <m3e-icon icon="mdi-bell"></m3e-icon>
              <span>ミュート中（${muted.length}）</span>
            </button>
            ${this.showMuted
              ? muted.map(
                  (m) => html`<div class="item">
                    <m3e-icon icon="link-off"></m3e-icon>
                    <span class="label-col">
                      <span class="name">${m.name}</span>
                      <span class="sub">${m.entry.permanent ? 'ずっと' : m.entry.until === null ? '復旧まで' : '一時ミュート中'}</span>
                    </span>
                    <button class="icon-btn unmute" @click=${() => this.unmute(m.key)}>解除</button>
                  </div>`,
                )
              : nothing}
          </div>`
        : nothing}
    </div>`;
  }
}

define('m3e-maintenance-card', M3eMaintenanceCard);
