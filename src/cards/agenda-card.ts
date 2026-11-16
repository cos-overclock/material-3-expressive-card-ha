import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { field, listOf, idsToObjects } from '../editor/form-helpers';
import { hhmm } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { SPRINGS, prefersReducedMotion, springTransition } from '../motion/spring';
import { define } from '../components/define';
import '../components/m3e-icon';

interface CalendarRef {
  entity: string;
  /** Initial in the small avatar, e.g. "そ". */
  person?: string;
  color?: Accent;
}

export interface AgendaCardConfig extends BaseCardConfig {
  /** Calendars to list. */
  calendars?: (string | CalendarRef)[];
  /** 1: today, 2: today and tomorrow (default), up to 7. */
  days?: number;
  title?: string;
  /** To-do list (e.g. todo.shopping_list) shown under the events. */
  todo?: string;
  todo_title?: string;
  /** Checked items kept visible (struck through). Default 3. */
  show_completed?: number;
  /** Hide the "項目を追加" field. */
  hide_add?: boolean;
}

interface CalEvent {
  key: string;
  summary: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  location?: string;
  cal: CalendarRef;
}

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

const COLORS: Accent[] = ['peach', 'pink', 'blue', 'teal', 'mauve', 'green'];
const REFRESH_MS = 10 * 60_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Today's (and tomorrow's) events from HA calendars, each with a colour bar
 * and the person's initial, followed by a to-do list (shopping list) you can
 * tick off and add to.
 *
 * Motion: ticking an item pops its check and slides it below the open items
 * on the default spatial spring (the others close the gap); new items grow in;
 * the add field opens in place of its button.
 */
export class M3eAgendaCard extends M3eBaseCard<AgendaCardConfig> {
  static override accentHint = '色を指定していないカレンダーと、To-do リストの色を変えます。';

  @state() private events: CalEvent[] = [];
  @state() private items: TodoItem[] = [];
  @state() private adding = false;
  @state() private draft = '';
  private eventsAt = 0;
  private todoState?: string;
  private positions = new Map<string, number>();

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 0 4px;
      }
      .title {
        font: 500 15px / 20px var(--m3e-font-plain);
      }
      .meta {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .events {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .event {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 10px 14px 10px 12px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        cursor: pointer;
        transition: border-radius var(--m3e-spatial-fast);
      }
      .event:active {
        border-radius: 20px;
      }
      .event.past {
        opacity: 0.55;
      }
      .event .bar {
        flex: none;
        width: 4px;
        align-self: stretch;
        border-radius: 2px;
        background: var(--accent-fill);
      }
      .event .text {
        flex: 1;
        min-width: 0;
      }
      .event .t {
        font: 500 15px / 20px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .event .s {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .who {
        flex: none;
        width: 28px;
        height: 28px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 12px / 1 var(--m3e-font-plain);
      }
      .divider {
        height: 1px;
        margin: 4px 0;
        background: var(--m3-outline-variant);
      }
      .empty {
        padding: 4px 4px 8px;
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .todo {
        display: flex;
        flex-direction: column;
      }
      .item {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 40px;
        padding: 0 4px;
        border-radius: 10px;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .item:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: -2px;
      }
      .box {
        flex: none;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        box-shadow: inset 0 0 0 2px var(--m3-outline);
        display: grid;
        place-items: center;
        color: var(--accent-on-fill);
        transition:
          background-color var(--m3e-effects-fast),
          box-shadow var(--m3e-effects-fast),
          border-radius var(--m3e-spatial-fast);
      }
      .box m3e-icon {
        --m3e-icon-size: 16px;
      }
      .item.done .box {
        background: var(--accent-fill);
        box-shadow: none;
      }
      .item:active .box {
        border-radius: 10px;
      }
      .item .label {
        font: 400 14px / 20px var(--m3e-font-plain);
        transition: color var(--m3e-effects-default);
      }
      .item.done .label {
        color: var(--m3-on-surface-variant);
        text-decoration: line-through;
      }
      .add {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 40px;
        margin-top: 6px;
        padding: 0 12px;
        border-radius: 12px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface-variant);
        font: 400 14px / 1 var(--m3e-font-plain);
        transition: border-radius var(--m3e-spatial-fast);
      }
      button.add {
        width: 100%;
        justify-content: flex-start;
      }
      button.add:active {
        border-radius: 20px;
        transform: none;
      }
      .add m3e-icon {
        --m3e-icon-size: 20px;
      }
      .add input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--m3-on-surface);
        font: inherit;
      }
      .add.editing {
        box-shadow: inset 0 0 0 2px var(--accent-fill);
      }
      .add .go {
        width: 32px;
        height: 32px;
        border-radius: 16px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 10px;
      }
      :host([compact]) .events {
        gap: 4px;
      }
      :host([compact]) .event {
        gap: 10px;
        min-height: 48px;
        padding: 8px 12px 8px 10px;
      }
      :host([compact]) .event .t {
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .event .s {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .item {
        min-height: 36px;
      }
      :host([compact]) .add {
        height: 36px;
        margin-top: 4px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const ids = Object.keys(hass.states);
    return {
      type: 'custom:m3e-agenda-card',
      calendars: ids.filter((id) => id.startsWith('calendar.')).slice(0, 3),
      todo: ids.find((id) => id.startsWith('todo.')),
    };
  }

  static getConfigForm() {
    return {
      schema: [
        listOf(
          'calendars',
          {
            entity: field.entity('カレンダー', { domain: 'calendar' }, true),
            person: field.text('アバターの文字（例：そ）'),
            color: field.accent(),
          },
          'entity',
          'person',
        ),
        { name: 'days', selector: { number: { min: 1, max: 7, mode: 'box' } } },
        { name: 'todo', selector: { entity: { domain: 'todo' } } },
        { name: 'show_completed', selector: { number: { min: 0, max: 20, mode: 'box' } } },
      ],
      toForm: (c: Record<string, unknown>) => idsToObjects(c, 'calendars'),
    };
  }

  protected normalizeConfig(config: AgendaCardConfig): AgendaCardConfig {
    if (!config.calendars?.length && !config.todo) throw new Error('calendars or todo is required');
    return config;
  }

  private cals(): CalendarRef[] {
    return (this.config.calendars ?? []).map((c, i) => {
      const ref = typeof c === 'string' ? { entity: c } : c;
      return { ...ref, color: ref.color ?? this.config.color ?? COLORS[i % COLORS.length] };
    });
  }

  /** Refetch events every REFRESH_MS and roll "today / tomorrow" over at midnight. */
  protected override clockInterval(): number {
    return 60_000;
  }

  protected watchedEntities(): string[] {
    return [...this.cals().map((c) => c.entity), this.config.todo].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'blue';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 8;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.hass) return;
    if (this.cals().length && Date.now() - this.eventsAt > REFRESH_MS) this.loadEvents();
    // A to-do entity's state is its open-item count: refetch when it changes.
    const t = this.config.todo ? this.stateObj(this.config.todo) : undefined;
    const key = t ? `${t.state}|${t.last_updated}` : undefined;
    if (this.config.todo && key !== this.todoState) {
      this.todoState = key;
      this.loadTodo();
    }
    // FLIP: remember where each item is before it moves.
    if ((changed as Map<string, unknown>).has('items')) {
      this.positions.clear();
      this.renderRoot?.querySelectorAll<HTMLElement>('.item[data-uid]').forEach((el) => this.positions.set(el.dataset.uid!, el.getBoundingClientRect().top));
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (!(changed as Map<string, unknown>).has('items') || !this.positions.size || prefersReducedMotion()) return;
    const t = springTransition(SPRINGS.spatialDefault);
    this.renderRoot.querySelectorAll<HTMLElement>('.item[data-uid]').forEach((el) => {
      const before = this.positions.get(el.dataset.uid!);
      const now = el.getBoundingClientRect().top;
      if (before === undefined) {
        el.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: t.duration, easing: t.easing });
      } else if (Math.abs(before - now) > 1) {
        el.animate([{ transform: `translateY(${before - now}px)` }, { transform: 'none' }], { duration: t.duration, easing: t.easing });
      }
    });
  }

  private async loadEvents(): Promise<void> {
    if (!this.hass?.callApi) return;
    this.eventsAt = Date.now();
    const start = dayStart(new Date());
    const end = new Date(start.getTime() + (this.config.days ?? 2) * 86400_000);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    try {
      const lists = await Promise.all(
        this.cals().map(async (cal) => {
          const raw = await this.hass!.callApi!<
            { uid?: string; summary: string; location?: string; start: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[]
          >('GET', `calendars/${cal.entity}?${q}`);
          return raw.map((e, i): CalEvent => {
            const allDay = !!e.start.date;
            return {
              key: `${cal.entity}:${e.uid ?? i}:${e.start.date ?? e.start.dateTime}`,
              summary: e.summary,
              location: e.location || undefined,
              allDay,
              start: allDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime!),
              end: e.end?.dateTime ? new Date(e.end.dateTime) : undefined,
              cal,
            };
          });
        }),
      );
      this.events = lists.flat().sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
    } catch (e) {
      console.warn('m3e-agenda-card: calendars unavailable', e);
    }
  }

  private async loadTodo(): Promise<void> {
    if (!this.hass?.callWS || !this.config.todo) return;
    try {
      const res = await this.hass.callWS<{ items: TodoItem[] }>({ type: 'todo/item/list', entity_id: this.config.todo });
      this.items = res.items;
    } catch (e) {
      console.warn('m3e-agenda-card: to-do list unavailable', e);
    }
  }

  private toggle(item: TodoItem): void {
    const status = item.status === 'completed' ? 'needs_action' : 'completed';
    // Optimistic: move it now, HA confirms by changing the list's state.
    this.items = this.items.map((i) => (i.uid === item.uid ? { ...i, status } : i));
    this.call('todo', 'update_item', { item: item.uid, status }, this.config.todo);
  }

  private add(): void {
    const text = this.draft.trim();
    if (!text) {
      this.adding = false;
      return;
    }
    this.items = [{ uid: `pending-${Date.now()}`, summary: text, status: 'needs_action' }, ...this.items];
    this.call('todo', 'add_item', { item: text }, this.config.todo);
    this.draft = '';
  }

  private eventLine(e: CalEvent): string {
    const today = dayStart(new Date());
    const day = Math.round((dayStart(e.start).getTime() - today.getTime()) / 86400_000);
    const prefix = day === 0 ? '' : day === 1 ? '明日 ' : `${e.start.getMonth() + 1}/${e.start.getDate()} `;
    const time = e.allDay ? '終日' : day === 0 && e.end ? `${hhmm(e.start)} – ${hhmm(e.end)}` : hhmm(e.start);
    return `${prefix}${time}${e.location ? `・${e.location}` : ''}`;
  }

  private renderEvents() {
    const now = Date.now();
    // Hide what has already ended today.
    const list = this.events.filter((e) => e.allDay || (e.end ?? e.start).getTime() > now);
    const days = this.config.days ?? 2;
    return html`<div class="head">
        <span class="title">${this.config.title ?? (days === 1 ? '今日の予定' : days === 2 ? '今日と明日の予定' : `${days}日間の予定`)}</span>
        <span class="meta">${list.length}件</span>
      </div>
      ${list.length
        ? html`<div class="events">
            ${repeat(
              list,
              (e) => e.key,
              (e) => html`<div class="event" data-accent=${e.cal.color} role="button" tabindex="0" @click=${() => this.moreInfo(e.cal.entity)}>
                <span class="bar"></span>
                <div class="text">
                  <p class="t">${e.summary}</p>
                  <p class="s">${this.eventLine(e)}</p>
                </div>
                ${e.cal.person ? html`<span class="who" aria-hidden="true">${e.cal.person}</span>` : nothing}
              </div>`,
            )}
          </div>`
        : html`<p class="empty">予定はありません</p>`}`;
  }

  private renderTodo() {
    const open = this.items.filter((i) => i.status === 'needs_action');
    const done = this.items.filter((i) => i.status === 'completed').slice(0, this.config.show_completed ?? 3);
    const name = this.config.todo_title ?? (this.stateObj(this.config.todo)?.attributes.friendly_name as string) ?? '買い物リスト';
    return html`<div class="head">
        <span class="title">${name}</span>
        <span class="meta">${open.length ? `残り ${open.length}件` : 'すべて完了'}</span>
      </div>
      <div class="todo" role="list">
        ${repeat(
          [...open, ...done],
          (i) => i.uid,
          (i) => html`<div
            class="item ${i.status === 'completed' ? 'done' : ''}"
            data-uid=${i.uid}
            role="checkbox"
            aria-checked=${i.status === 'completed' ? 'true' : 'false'}
            tabindex="0"
            @click=${() => this.toggle(i)}
            @keydown=${(e: KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), this.toggle(i))}
          >
            <span class="box">${i.status === 'completed' ? html`<m3e-icon icon="check"></m3e-icon>` : nothing}</span>
            <span class="label">${i.summary}</span>
          </div>`,
        )}
      </div>
      ${this.config.hide_add
        ? nothing
        : this.adding
          ? html`<div class="add editing">
              <m3e-icon icon="add"></m3e-icon>
              <input
                aria-label="追加する項目"
                placeholder="例：たまご"
                .value=${this.draft}
                @input=${(e: InputEvent) => (this.draft = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' && !e.isComposing) this.add();
                  if (e.key === 'Escape') this.adding = false;
                }}
                @blur=${() => !this.draft && (this.adding = false)}
              />
              <button class="icon-btn go" aria-label="追加" @click=${() => this.add()}><m3e-icon icon="check"></m3e-icon></button>
            </div>`
          : html`<button
              class="icon-btn add"
              @click=${async () => {
                this.adding = true;
                await this.updateComplete;
                this.renderRoot.querySelector<HTMLInputElement>('.add input')?.focus();
              }}
            >
              <m3e-icon icon="add"></m3e-icon>項目を追加
            </button>`}`;
  }

  protected renderCard() {
    const hasCals = this.cals().length > 0;
    return html`<div class="card">
      ${hasCals ? this.renderEvents() : nothing}
      ${hasCals && this.config.todo ? html`<div class="divider"></div>` : nothing}
      ${this.config.todo ? this.renderTodo() : nothing}
    </div>`;
  }
}

define('m3e-agenda-card', M3eAgendaCard);
