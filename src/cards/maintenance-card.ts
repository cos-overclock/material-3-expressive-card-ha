import { css, html, nothing } from 'lit';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { domainOf, entityIdsOfDomain, fireHaptic, numState } from '../ha/helpers';
import type { HassEntity, HomeAssistant, LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';

export interface MaintenanceCardConfig extends BaseCardConfig {
  title?: string;
  /** Batteries at or below this % are listed. Default 20. */
  battery_threshold?: number;
  show_batteries?: boolean;
  /** update.* entities with an update available. Default true. */
  show_updates?: boolean;
  /** Entities that are unavailable. Default true. */
  show_unavailable?: boolean;
  /** Leave out entities whose id matches one of these (`*` wildcards: sensor.*_rssi). */
  exclude?: string[];
  /** Rows per section before "ほか N件". Default 5. */
  max_items?: number;
}

interface Item {
  entity: string;
  name: string;
  value: string;
  icon: string;
  tone?: 'alert' | 'warn';
}

// UpdateEntityFeature.INSTALL
const INSTALL = 1;

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

/**
 * What needs looking after: low batteries, devices with an update, and
 * entities that have gone unavailable. Each row opens the entity; an update
 * row can install it (admins).
 *
 * The lists come from every entity in HA, so the card re-reads them once a
 * minute (and when a battery or update entity changes) rather than on every
 * state change.
 */
export class M3eMaintenanceCard extends M3eBaseCard<MaintenanceCardConfig> {
  static override accentHint = 'すべて正常のときの色を変えます。';
  private excludeRe: RegExp[] = [];

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
      .item .name {
        flex: 1;
        min-width: 0;
        font: 500 14px / 20px var(--m3e-font-plain);
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
      .install {
        height: 32px;
        padding: 0 12px;
        border-radius: 16px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        font: 500 13px / 1 var(--m3e-font-plain);
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
        { name: 'max_items', selector: { number: { min: 1, max: 30, mode: 'box' } } },
        { name: 'exclude', selector: { text: { multiple: true } } },
      ],
      computeLabel: (s: { name: string }) =>
        ({
          battery_threshold: 'この残量以下を表示',
          show_batteries: '電池残量',
          show_updates: 'アップデート',
          show_unavailable: '利用できないエンティティ',
          max_items: '1項目に出す件数',
          exclude: '除外するエンティティ（* が使える）',
        })[s.name],
    };
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
    return [...this.batteryIds(), ...entityIdsOfDomain(this.hass, 'update')];
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
        if (s.state === 'on') out.push({ entity: id, name: this.name(s), value: '残量わずか', icon: 'battery-alert', tone: 'alert', level: 0 });
        continue;
      }
      const level = numState(s);
      if (level === undefined || level > limit) continue;
      out.push({
        entity: id,
        name: this.name(s),
        value: `${Math.round(level)}%`,
        icon: level <= limit / 2 ? 'battery-alert' : 'battery-2-bar',
        tone: level <= limit / 2 ? 'alert' : 'warn',
        level,
      });
    }
    return out.sort((a, b) => a.level - b.level);
  }

  private updates(): (Item & { installable: boolean })[] {
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

  /** Unavailable entities that matter: visible, not diagnostic / config. */
  private unavailable(hass: HomeAssistant): Item[] {
    const reg = hass.entities;
    const out: Item[] = [];
    for (const id in hass.states) {
      const s = hass.states[id];
      if (s.state !== 'unavailable' || this.excluded(id)) continue;
      const entry = reg?.[id];
      if (entry?.hidden || entry?.entity_category) continue;
      // Groups and helpers mirror other entities; skip the noise.
      if (['group', 'automation', 'script', 'scene', 'update', 'button', 'event'].includes(domainOf(id))) continue;
      out.push({ entity: id, name: this.name(s), value: '利用不可', icon: 'link-off' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  private install(e: Event, entity: string): void {
    e.stopPropagation();
    fireHaptic(this, 'success');
    this.call('update', 'install', {}, entity);
  }

  private section(title: string, items: (Item & { installable?: boolean })[]) {
    if (!items.length) return nothing;
    const max = this.config.max_items ?? 5;
    const canInstall = this.hass?.user?.is_admin !== false;
    return html`<section>
      <h3>${title}（${items.length}）</h3>
      ${items.slice(0, max).map(
        (it) => html`<div
          class="item ${it.tone ?? ''}"
          role="button"
          tabindex="0"
          @click=${() => this.moreInfo(it.entity)}
          @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && this.moreInfo(it.entity)}
        >
          <m3e-icon .icon=${it.icon}></m3e-icon>
          <span class="name">${it.name}</span>
          ${it.value ? html`<span class="value">${it.value}</span>` : nothing}
          ${it.installable && canInstall
            ? html`<button class="icon-btn install" @click=${(e: Event) => this.install(e, it.entity)}>更新</button>`
            : nothing}
        </div>`,
      )}
      ${items.length > max ? html`<p class="more">ほか ${items.length - max}件</p>` : nothing}
    </section>`;
  }

  protected renderCard() {
    if (!this.hass) return nothing;
    const c = this.config;
    const batteries = c.show_batteries !== false ? this.batteries() : [];
    const updates = c.show_updates !== false ? this.updates() : [];
    const unavailable = c.show_unavailable !== false ? this.unavailable(this.hass) : [];
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
      ${this.section('電池残量が少ない', batteries)} ${this.section('アップデートがあります', updates)}
      ${this.section('利用できません', unavailable)}
    </div>`;
  }
}

define('m3e-maintenance-card', M3eMaintenanceCard);
