import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { checkEntity, checkNumber, checkOneOf, checkTime, isDate, type Issue } from '../editor/validate';
import { field, listOf } from '../editor/form-helpers';
import { isActive } from '../ha/helpers';
import { DAYS, ruleHits, ymd, type Rule } from '../ha/garbage-rules';
import { FetchTracker } from '../ha/fetch-state';
import type { LovelaceGridOptions } from '../ha/types';
import { ACCENTS, type Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-fetch-status';

const WEEK_OPTIONS = ['1', '2', '3', '4', '5'].map((w) => ({ value: w, label: '第' + w }));
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export interface GarbageCardConfig extends BaseCardConfig {
  title?: string;
  /** Weekly rules (Japanese municipal style). */
  schedule?: Rule[];
  /** And / or a calendar whose events are collection days (event title = type). */
  calendar?: string;
  /** Put-out deadline on the day, "08:30". After it, today's collection is over. */
  deadline?: string;
  /** Colour per type; otherwise guessed from the name (燃やす → red, プラ → yellow…). */
  colors?: Record<string, Accent>;
  /** input_boolean turned on by "出した" (reset it with an automation). Default: remembered on this device. */
  done_entity?: string;
  /** Upcoming collections listed under the next one. Default 3. */
  upcoming?: number;
  /** Small note, e.g. "前日 20:00 にスマホへ通知します". */
  note?: string;
}

interface Collection {
  date: Date;
  types: string[];
}

const GUESS: [RegExp, Accent][] = [
  [/燃えない|不燃/, 'lavender'],
  [/燃やす|燃える|可燃/, 'red'],
  [/プラ/, 'yellow'],
  [/びん|ビン|缶|ペット/, 'sky'],
  [/紙|古布|資源/, 'teal'],
  [/粗大/, 'mauve'],
];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Garbage collection: the next collection day large with a "出した" button,
 * the next few after it, and a note. Days come from weekday rules (with 第N週)
 * and / or a calendar.
 *
 * Motion: pressing 出した morphs the panel from the type's colour to the
 * neutral surface on the effects spring while the cookie becomes a circle
 * and a check pops in; the button widens and rounds while pressed.
 */
export class M3eGarbageCard extends M3eBaseCard<GarbageCardConfig> {
  static override accentHint = '色を指定していないゴミの種類は、名前から決まる色の代わりにこの色になります。';

  @state() private calendarDays: Collection[] = [];
  @state() private localDone = '';
  @state() private pressed = false;
  private loadedAt = 0;
  private readonly fetch = new FetchTracker<Collection[]>(this, { label: 'm3e-garbage-card' });

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
      }
      .header m3e-shape {
        --m3e-shape-color: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      .name {
        font: 500 16px / 20px var(--m3e-font-plain);
      }
      .sub {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .next {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 12px 14px 16px;
        border-radius: 12px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .next.done {
        background: var(--m3-surface-high);
        color: var(--m3-on-surface-variant);
      }
      .next .text {
        flex: 1;
        min-width: 0;
      }
      .when {
        font: 500 13px / 18px var(--m3e-font-plain);
        font-variant-numeric: tabular-nums;
      }
      .type {
        display: flex;
        align-items: center;
        gap: 6px;
        font: 500 24px / 30px var(--m3e-font-plain);
      }
      .type m3e-icon {
        --m3e-icon-size: 24px;
      }
      .done-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 16px 0 12px;
        border-radius: 20px;
        background: var(--accent-fill);
        color: var(--accent-on-fill);
        font: 500 13px / 1 var(--m3e-font-plain);
        white-space: nowrap;
        transition:
          border-radius var(--m3e-spatial-fast),
          padding var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      :host([theme='mocha']) .next:not(.done) .done-btn {
        background: var(--accent-on-container);
        color: var(--accent-container);
      }
      .done-btn m3e-icon {
        --m3e-icon-size: 16px;
      }
      .done-btn.pressed {
        border-radius: 12px;
        padding: 0 20px 0 16px;
      }
      .done-btn:active {
        transform: none;
      }
      .next.done .done-btn {
        background: transparent;
        color: var(--m3-on-surface-variant);
        box-shadow: inset 0 0 0 1px var(--m3-outline);
      }
      .list {
        display: flex;
        flex-direction: column;
        padding: 0 4px;
      }
      .item {
        display: grid;
        grid-template-columns: 84px 8px 1fr;
        align-items: center;
        gap: 12px;
        min-height: 32px;
        font: 400 13px / 18px var(--m3e-font-plain);
      }
      .item .date {
        color: var(--m3-on-surface-variant);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .item i {
        width: 8px;
        height: 8px;
        border-radius: 4px;
        background: var(--accent-fill);
      }
      .item .t {
        font-weight: 500;
      }
      .note {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 4px;
        font: 400 12px / 16px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .note m3e-icon {
        --m3e-icon-size: 16px;
      }
      .empty {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
        padding: 0 4px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .header {
        gap: 10px;
      }
      :host([compact]) .name {
        font: 500 15px / 20px var(--m3e-font-plain);
      }
      :host([compact]) .sub {
        font: 400 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .next {
        padding: 10px 10px 10px 14px;
      }
      :host([compact]) .when {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .type {
        font: 500 20px / 26px var(--m3e-font-plain);
      }
      :host([compact]) .done-btn {
        height: 36px;
        padding: 0 14px 0 10px;
      }
      :host([compact]) .done-btn.pressed {
        padding: 0 18px 0 14px;
      }
      :host([compact]) .item {
        grid-template-columns: 76px 8px 1fr;
        gap: 10px;
        min-height: 28px;
        font: 400 12px / 16px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig() {
    return {
      type: 'custom:m3e-garbage-card',
      deadline: '08:30',
      schedule: [
        { type: '燃やすゴミ', days: ['tue', 'fri'] },
        { type: 'プラスチック資源', days: ['mon'] },
      ],
    };
  }

  static getConfigForm() {
    return {
      schema: [
        listOf(
          'schedule',
          {
            type: field.text('種類（例：燃やすゴミ）', true),
            days: field.select('曜日', DAYS.map((d, i) => ({ value: d, label: WEEKDAY[i] })), true),
            weeks: field.select('第何週（省略で毎週）', WEEK_OPTIONS, true),
            dates: field.texts('日付（YYYY-MM-DD）'),
            color: field.accent(),
          },
          'type',
        ),
        { name: 'calendar', selector: { entity: { domain: 'calendar' } } },
        { name: 'deadline', selector: { text: {} } },
        { name: 'done_entity', selector: { entity: { domain: 'input_boolean' } } },
        { name: 'note', selector: { text: {} } },
      ],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    const out: Issue[] = [
      ...checkEntity(c, 'calendar', ['calendar'], 'カレンダー'),
      ...checkEntity(c, 'done_entity', undefined, '「出した」を記録するエンティティ'),
      ...checkTime(c, 'deadline', '締め切り時刻'),
      ...checkNumber(c, 'upcoming', { min: 0, max: 20, integer: true, label: 'その先の予定の件数' }),
    ];
    if (c.schedule !== undefined && !Array.isArray(c.schedule)) {
      out.push({ path: 'schedule', level: 'error', message: 'schedule must be a list', hint: '収集日はリストで書いてください' });
    } else if (Array.isArray(c.schedule)) {
      c.schedule.forEach((r: unknown, i) => {
        if (!r || typeof r !== 'object') {
          out.push({ path: `schedule.${i}`, level: 'error', message: `schedule.${i} must be an object`, hint: `収集日 ${i + 1} の設定が正しくありません` });
          return;
        }
        const rule = r as Record<string, unknown>;
        if (!rule.type || typeof rule.type !== 'string') {
          out.push({ path: `schedule.${i}.type`, level: 'error', message: 'schedule: every rule needs a type', hint: `収集日 ${i + 1} の種類を入力してください` });
        }
        if (rule.days !== undefined) {
          if (!Array.isArray(rule.days)) {
            out.push({ path: `schedule.${i}.days`, level: 'error', message: `schedule.${i}.days must be a list`, hint: `収集日 ${i + 1} の曜日はリストで書いてください` });
          } else if (rule.days.some((d) => typeof d !== 'string' || !DAYS.includes(d as (typeof DAYS)[number]))) {
            out.push({ path: `schedule.${i}.days`, level: 'error', message: `schedule: days are ${DAYS.join(', ')}`, hint: `収集日 ${i + 1} の曜日は ${DAYS.join('・')} から選んでください` });
          }
        }
        if (rule.weeks !== undefined) {
          if (!Array.isArray(rule.weeks)) {
            out.push({ path: `schedule.${i}.weeks`, level: 'error', message: `schedule.${i}.weeks must be a list`, hint: `収集日 ${i + 1} の「第何週」はリストで書いてください` });
          } else {
            for (const w of rule.weeks) {
              const ok = (typeof w === 'number' || (typeof w === 'string' && w.trim() !== '')) && Number.isInteger(Number(w)) && Number(w) >= 1 && Number(w) <= 5;
              if (!ok) {
                out.push({
                  path: `schedule.${i}.weeks`,
                  level: 'error',
                  message: `schedule.${i}.weeks: ${w} must be 1 to 5`,
                  hint: `収集日 ${i + 1} の「第何週」は 1〜5 にしてください（いまは ${JSON.stringify(w)}）`,
                });
              }
            }
          }
        }
        if (rule.dates !== undefined) {
          if (!Array.isArray(rule.dates)) {
            out.push({ path: `schedule.${i}.dates`, level: 'error', message: `schedule.${i}.dates must be a list`, hint: `収集日 ${i + 1} の日付はリストで書いてください` });
          } else {
            for (const d of rule.dates) {
              if (!isDate(d)) {
                out.push({
                  path: `schedule.${i}.dates`,
                  level: 'error',
                  message: `schedule.${i}.dates: ${d} must be a date like 2026-12-31`,
                  hint: `収集日 ${i + 1} の日付は 2026-12-31 のように書いてください（いまは ${JSON.stringify(d)}）`,
                });
              }
            }
          }
        }
        out.push(...checkOneOf(c, `schedule.${i}.color`, ACCENTS, `収集日 ${i + 1} の色`));
      });
    }
    if ((!Array.isArray(c.schedule) || !c.schedule.length) && !c.calendar) {
      out.push({ path: 'schedule', level: 'error', message: 'schedule or calendar is required', hint: '収集日かカレンダーのどちらかを指定してください' });
    }
    return out;
  }

  protected normalizeConfig(config: GarbageCardConfig): GarbageCardConfig {
    if (!config.schedule?.length && !config.calendar) throw new Error('schedule or calendar is required');
    // The editor's week picker gives strings ('1'); the rules compare numbers.
    config.schedule = config.schedule?.map((r) => (r.weeks ? { ...r, weeks: r.weeks.map(Number) } : r));
    for (const r of config.schedule ?? []) {
      if (!r.type) throw new Error('schedule: every rule needs a type');
      if (r.days?.some((d) => !DAYS.includes(d))) throw new Error(`schedule: days are ${DAYS.join(', ')}`);
    }
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.done_entity].filter(Boolean) as string[];
  }

  protected override defaultAccent(): Accent {
    return 'green';
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 5;
  }

  /** The deadline and "today / tomorrow" move with the clock. */
  protected override clockInterval(): number {
    return 60_000;
  }

  private get now(): Date {
    return new Date(this.clockNow);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const cal = this.config.calendar;
    if (!cal) {
      if (this.fetch.status !== 'idle') {
        this.fetch.reset();
        this.calendarDays = [];
      }
    } else if (this.hass?.callApi && (cal !== this.fetch.key || Date.now() - this.loadedAt > 3600_000)) this.loadCalendar();
  }

  private readonly retry = () => this.loadCalendar();

  private async loadCalendar(): Promise<void> {
    const hass = this.hass;
    const cal = this.config.calendar;
    if (!hass?.callApi || !cal) return;
    // Another calendar: its days must not stay on screen.
    if (this.fetch.shownKey !== cal) this.calendarDays = [];
    this.loadedAt = Date.now();
    const start = dayStart(new Date());
    const end = new Date(start.getTime() + 45 * 86400_000);
    await this.fetch.run(cal, async () => {
      const events = await hass.callApi!<{ summary: string; start: { date?: string; dateTime?: string } }[]>(
        'GET',
        `calendars/${cal}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
      );
      const byDay = new Map<string, Collection>();
      for (const e of events) {
        const raw = e.start.date ?? e.start.dateTime;
        if (!raw) continue;
        const d = e.start.date ? new Date(`${e.start.date}T00:00:00`) : dayStart(new Date(raw));
        const key = ymd(d);
        const c = byDay.get(key) ?? { date: d, types: [] };
        if (!c.types.includes(e.summary)) c.types.push(e.summary);
        byDay.set(key, c);
      }
      return [...byDay.values()];
    }, (days) => (this.calendarDays = days));
  }

  /** Collection days from today on, rules and calendar merged. */
  private collections(): Collection[] {
    const out = new Map<string, Collection>();
    const today = dayStart(this.now);
    for (let i = 0; i < 45; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const types = (this.config.schedule ?? []).filter((r) => ruleHits(r, d)).map((r) => r.type);
      if (types.length) out.set(ymd(d), { date: d, types });
    }
    for (const c of this.calendarDays) {
      if (c.date < today) continue;
      const key = ymd(c.date);
      const cur = out.get(key);
      if (cur) c.types.forEach((t) => !cur.types.includes(t) && cur.types.push(t));
      else out.set(key, { date: c.date, types: [...c.types] });
    }
    const [h, m] = (this.config.deadline ?? '08:30').split(':').map(Number);
    const deadline = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h || 0, m || 0);
    return [...out.values()]
      .filter((c) => !(ymd(c.date) === ymd(today) && this.now > deadline))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private colorOf(type: string): Accent {
    const fromRule = this.config.schedule?.find((r) => r.type === type)?.color;
    return this.config.colors?.[type] ?? fromRule ?? this.config.color ?? GUESS.find(([re]) => re.test(type))?.[1] ?? 'green';
  }

  private dateLabel(d: Date, relative: boolean): string {
    const base = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY[d.getDay()]}）`;
    if (!relative) return base;
    const diff = Math.round((dayStart(d).getTime() - dayStart(this.now).getTime()) / 86400_000);
    const word = diff === 0 ? '今日' : diff === 1 ? '明日' : diff === 2 ? 'あさって' : '';
    return word ? `${word} ${base}` : base;
  }

  private doneKey(c: Collection): string {
    return `m3e-garbage-done:${ymd(c.date)}:${c.types.join('|')}`;
  }

  private isDone(c: Collection): boolean {
    if (this.config.done_entity) return isActive(this.stateObj(this.config.done_entity));
    if (this.localDone === this.doneKey(c)) return true;
    try {
      return localStorage.getItem(this.doneKey(c)) === '1';
    } catch {
      return false;
    }
  }

  private toggleDone(c: Collection): void {
    const done = this.isDone(c);
    if (this.config.done_entity) {
      this.call('homeassistant', done ? 'turn_off' : 'turn_on', {}, this.config.done_entity);
      return;
    }
    try {
      if (done) localStorage.removeItem(this.doneKey(c));
      else localStorage.setItem(this.doneKey(c), '1');
    } catch {
      // Storage blocked: keep it for this session only.
    }
    this.localDone = done ? '' : this.doneKey(c);
  }

  protected renderCard() {
    const all = this.collections();
    const next = all[0];
    const rest = all.slice(1).flatMap((c) => c.types.map((t) => ({ date: c.date, type: t }))).slice(0, this.config.upcoming ?? 3);
    const deadline = this.config.deadline ?? '08:30';
    const morning = Number(deadline.split(':')[0]) < 12;
    const done = next ? this.isDone(next) : false;
    return html`<div class="card">
      <div class="header">
        <m3e-shape .shape=${done ? 'circle' : 'cookie9'} size=${this.compact ? 36 : 44}><m3e-icon icon="delete"></m3e-icon></m3e-shape>
        <div>
          <p class="name">${this.config.title ?? 'ゴミ出し'}</p>
          <p class="sub">収集は${morning ? '朝 ' : ' '}${deadline.replace(/^0/, '')} まで</p>
        </div>
      </div>
      ${next
        ? html`<div class="next ${done ? 'done' : ''}" data-accent=${this.colorOf(next.types[0])}>
            <div class="text">
              <p class="when">${this.dateLabel(next.date, true)}</p>
              <p class="type">${done ? html`<m3e-icon icon="check-circle"></m3e-icon>` : nothing}${next.types.join('・')}</p>
            </div>
            <button
              class="icon-btn done-btn ${this.pressed ? 'pressed' : ''}"
              aria-pressed=${done ? 'true' : 'false'}
              @click=${() => this.toggleDone(next)}
              @pointerdown=${() => (this.pressed = true)}
              @pointerup=${() => (this.pressed = false)}
              @pointerleave=${() => (this.pressed = false)}
            >
              ${done ? '取り消す' : html`<m3e-icon icon="check"></m3e-icon>出した`}
            </button>
          </div>`
        : this.fetch.status === 'error' && !this.fetch.view.hasData
          ? nothing
          : html`<p class="empty">予定されている収集日はありません</p>`}
      ${rest.length
        ? html`<div class="list">
            ${rest.map(
              (r) => html`<div class="item" data-accent=${this.colorOf(r.type)}>
                <span class="date">${this.dateLabel(r.date, false)}</span><i></i><span class="t">${r.type}</span>
              </div>`,
            )}
          </div>`
        : nothing}
      ${this.config.note ? html`<p class="note"><m3e-icon icon="notifications-active"></m3e-icon>${this.config.note}</p>` : nothing}
      ${this.config.calendar
        ? html`<m3e-fetch-status .view=${this.fetch.view} subject="カレンダー" emptyText="" @retry=${this.retry}></m3e-fetch-status>`
        : nothing}
    </div>`;
  }
}

define('m3e-garbage-card', M3eGarbageCard);
