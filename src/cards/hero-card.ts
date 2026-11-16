import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { checkEntity, checkNumber, checkOneOf, type Issue } from '../editor/validate';
import { WEATHER_ICON, WEATHER_LABEL, WEEKDAY } from '../ha/labels';
import { entityIdsOfDomain } from '../ha/helpers';
import { ForecastSubscriptions, upcoming, type Forecast, type ForecastType } from '../ha/weather';
import type { LovelaceGridOptions } from '../ha/types';
import { define } from '../components/define';
import '../components/m3e-icon';
import '../components/m3e-shape';
import '../components/m3e-rolling-text';


export interface HeroCardConfig extends BaseCardConfig {
  /** full: the overview hero (default). footer: a two-row (120px) bar for the view footer. */
  layout?: 'full' | 'footer';
  weather?: string;
  /** Large line under the clock. Default: "照明N つ点灯中" from lights that are on. */
  title?: string;
  /** Small line under the title. */
  subtitle?: string;
  /** Lights counted for the default title (default: every light.*). */
  lights?: string[];
  /** People counted for the presence chip (default: every person.*). */
  people?: string[];
  /** Days of forecast. Default 5 (full) / 3 (footer, shown when the bar is 520px or wider). With hourly: hours. */
  forecast_days?: number;
  /** daily (default): the next days. hourly: the next hours ("15時"). */
  forecast_type?: 'daily' | 'hourly';
}

/**
 * Overview hero: date, presence chip, big clock, house summary, current
 * weather and a short daily forecast.
 *
 * `layout: footer` packs the same into a two-row (120px) bar for a sections view's
 * footer: clock and date on the left, the next days and the current weather
 * on the right. Narrow bars drop the forecast, then the month and today's range.
 *
 * Motion: clock digits roll each minute; the 12-point weather cookie turns
 * slowly; changing conditions morph the glyph in on the fast spatial spring.
 */
export class M3eHeroCard extends M3eBaseCard<HeroCardConfig> {
  static override accentHint = '天気の表示の色を変えます。在宅のチップと週間予報のアイコンの色は変わりません。';

  @state() private now = new Date();
  @state() private forecast: Forecast[] = [];
  private tick?: ReturnType<typeof setTimeout>;
  @state() private hourly: Forecast[] = [];
  private forecasts = new ForecastSubscriptions((type, list) => {
    if (type === 'hourly') this.hourly = list;
    else this.forecast = list;
  });

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font: 500 14px / 20px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px 4px 8px;
        border-radius: 8px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        font: 500 13px / 18px var(--m3e-font-plain);
        transition:
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      .chip m3e-icon {
        --m3e-icon-size: 18px;
      }
      .time {
        font: 500 96px / 100px var(--m3e-font-brand);
        letter-spacing: -3px;
        font-variant-numeric: tabular-nums;
      }
      .title {
        font: 500 24px / 36px var(--m3e-font-plain);
        margin-top: 2px;
      }
      .subtitle {
        font: 400 14px / 22px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .weather {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        border-radius: 12px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        cursor: pointer;
        transition: border-radius var(--m3e-spatial-fast);
      }
      .weather:active {
        border-radius: 24px;
      }
      .weather m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        --m3e-icon-size: 36px;
      }
      .wtemp {
        font: 600 40px / 44px var(--m3e-font-brand);
      }
      .cond {
        font: 500 15px / 22px var(--m3e-font-plain);
      }
      .detail {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      .days {
        display: flex;
        justify-content: space-between;
      }
      .day {
        width: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .dow {
        font: 500 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .day m3e-icon {
        color: var(--accent-fill);
      }
      .day [data-accent='neutral'] {
        color: var(--m3-on-surface-variant);
      }
      .hi {
        font: 600 16px / 22px var(--m3e-font-brand);
      }
      .lo {
        font: 400 14px / 20px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
      }

      /* ---- footer: a two-row bar (120px) for the view footer ---- */
      :host([layout='footer']) {
        height: 100%;
        container-type: inline-size;
      }
      .bar {
        height: 100%;
        min-height: 120px;
        padding: 16px 16px 16px 24px;
        border-radius: 28px;
        background: var(--m3-surface-high);
        /* HA gives the view footer an elevation shadow through this variable. */
        box-shadow: var(--ha-card-box-shadow, none);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 20px;
      }
      .bar .clock {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .bar .clock p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar .date,
      .bar .line2 {
        font: 500 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .bar .line2 {
        font-weight: 400;
      }
      .bar .time {
        font: 500 44px / 48px var(--m3e-font-brand);
        letter-spacing: -1px;
      }
      .bar .days {
        flex: none;
        gap: 8px;
      }
      .bar .day {
        width: 40px;
        gap: 2px;
      }
      .bar .dow {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      .bar .day m3e-icon {
        --m3e-icon-size: 22px;
      }
      .bar .hi {
        font: 600 14px / 18px var(--m3e-font-brand);
      }
      .bar .lo {
        font: 400 12px / 16px var(--m3e-font-brand);
      }
      .now {
        flex: none;
        align-self: stretch;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 20px 0 14px;
        border-radius: 24px;
        background: var(--accent-container);
        color: var(--accent-on-container);
        cursor: pointer;
        transition: border-radius var(--m3e-spatial-fast);
      }
      .now:active {
        border-radius: 36px;
      }
      .now:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      .now m3e-shape {
        --m3e-shape-color: var(--accent-shape);
        color: var(--accent-on-shape);
        --m3e-icon-size: 28px;
      }
      .now .w {
        display: flex;
        flex-direction: column;
        white-space: nowrap;
      }
      .now .t {
        font: 600 30px / 34px var(--m3e-font-brand);
      }
      .now .c {
        font: 500 13px / 18px var(--m3e-font-plain);
      }
      .now .r {
        font: 400 12px / 16px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }

      /* ---- compact: clock and the weather pill side by side ---- */
      :host([compact]) .card:not(.bar) {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .meta {
        font: 500 13px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .chip {
        padding: 2px 10px 2px 6px;
        font: 500 12px / 18px var(--m3e-font-plain);
      }
      :host([compact]) .chip m3e-icon {
        --m3e-icon-size: 16px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .head .clock {
        flex: 1;
        min-width: 0;
      }
      .head .clock p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :host([compact]) .card:not(.bar) .time {
        font: 500 56px / 60px var(--m3e-font-brand);
        letter-spacing: -1.5px;
      }
      :host([compact]) .title {
        font: 500 16px / 24px var(--m3e-font-plain);
        margin-top: 0;
      }
      :host([compact]) .subtitle {
        font: 400 12px / 18px var(--m3e-font-plain);
      }
      .head .now {
        align-self: auto;
        padding: 10px 16px 10px 10px;
        gap: 10px;
      }
      .head .now m3e-shape {
        --m3e-icon-size: 24px;
      }
      .head .now .t {
        font: 600 26px / 30px var(--m3e-font-brand);
      }
      :host([compact]) .card:not(.bar) .day {
        width: 40px;
        gap: 2px;
      }
      :host([compact]) .card:not(.bar) .dow {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      :host([compact]) .card:not(.bar) .day m3e-icon {
        --m3e-icon-size: 20px;
      }
      :host([compact]) .card:not(.bar) .hi {
        font: 600 14px / 18px var(--m3e-font-brand);
      }
      :host([compact]) .card:not(.bar) .lo {
        font: 400 12px / 16px var(--m3e-font-brand);
      }

      @container (width < 540px) {
        .bar .days {
          display: none;
        }
      }
      @container (width < 360px) {
        .bar {
          padding-left: 20px;
          gap: 12px;
        }
        .bar .time {
          font-size: 40px;
        }
        .bar .month,
        .now .r {
          display: none;
        }
        .now {
          padding: 0 16px 0 10px;
          gap: 8px;
        }
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const weather = Object.keys(hass.states).find((id) => id.startsWith('weather.'));
    return { type: 'custom:m3e-hero-card', weather };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'full', label: '大きい時計と天気（既定）' },
                { value: 'footer', label: 'フッター（1行のバー）' },
              ],
            },
          },
        },
        { name: 'weather', selector: { entity: { domain: 'weather' } } },
        { name: 'title', selector: { text: {} } },
        { name: 'subtitle', selector: { text: {} } },
        { name: 'forecast_days', selector: { number: { min: 0, max: 12, mode: 'box' } } },
        {
          name: 'forecast_type',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'daily', label: '日ごと（既定）' },
                { value: 'hourly', label: '1時間ごと' },
              ],
            },
          },
        },
      ],
    };
  }

  static override validateConfig(c: Record<string, unknown>): Issue[] {
    return [
      ...checkEntity(c, 'weather', ['weather'], '天気'),
      ...checkOneOf(c, 'layout', ['full', 'footer'], 'レイアウト'),
      ...checkOneOf(c, 'forecast_type', ['daily', 'hourly'], '予報の種類'),
      ...checkNumber(c, 'forecast_days', { min: 0, max: 14, integer: true, label: '予報の日数' }),
    ];
  }

  protected normalizeConfig(config: HeroCardConfig): HeroCardConfig {
    return config;
  }

  protected watchedEntities(): string[] {
    const people = this.config.people ?? entityIdsOfDomain(this.hass, 'person');
    const lights = this.config.title ? [] : (this.config.lights ?? entityIdsOfDomain(this.hass, 'light'));
    return [this.config.weather ?? '', ...people, ...lights].filter(Boolean);
  }

  private get footer(): boolean {
    return this.config?.layout === 'footer';
  }

  override getGridOptions(): LovelaceGridOptions {
    // A number of rows makes HA's view footer (and sections) size the card exactly: 2 rows = 120px.
    return this.footer
      ? { columns: 12, rows: 2, min_rows: 2, max_rows: 2, min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return this.footer ? 2 : this.isCompact() ? 4 : 7;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const layout = this.config?.layout ?? 'full';
    if (this.getAttribute('layout') !== layout) this.setAttribute('layout', layout);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.startTick();
    this.subscribe();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.tick);
    this.unsubscribe();
  }

  protected override visibilityChanged(): void {
    this.startTick();
  }

  /** Update the clock on each minute boundary while the page is visible. */
  private startTick(): void {
    clearTimeout(this.tick);
    this.tick = undefined;
    if (!this.pageVisible) return;
    const schedule = () => {
      this.now = new Date();
      this.tick = setTimeout(schedule, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
  }

  protected override shouldUpdate(changed: Map<PropertyKey, unknown>): boolean {
    return changed.has('now') || changed.has('forecast') || changed.has('hourly') || super.shouldUpdate(changed as never);
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    if (changed.has('hass') || changed.has('config')) this.subscribe();
  }

  /** Daily for today's high / low (and the days row); hourly too when the row shows hours. */
  private subscribe(): void {
    const types: ForecastType[] = this.config?.forecast_type === 'hourly' ? ['daily', 'hourly'] : ['daily'];
    this.forecasts.sync(this.hass, this.config?.weather, types);
  }

  private unsubscribe(): void {
    this.forecasts.stop();
  }

  private defaultTitle(): string {
    const ids = this.config.lights ?? entityIdsOfDomain(this.hass, 'light');
    const on = ids.filter((id) => this.stateObj(id)?.state === 'on').length;
    return on ? `照明${on}つ点灯中` : '照明はすべて消灯';
  }

  private presence() {
    const ids = this.config.people ?? entityIdsOfDomain(this.hass, 'person');
    if (!ids.length) return nothing;
    const home = ids.filter((id) => this.stateObj(id)?.state === 'home').length;
    return html`<span class="chip" data-accent=${home ? 'green' : 'neutral'}>
      <m3e-icon icon="home"></m3e-icon>${home ? `在宅 ${home}人` : '全員外出'}
    </span>`;
  }

  private weather() {
    const w = this.stateObj(this.config.weather);
    if (!w) return nothing;
    const [icon] = WEATHER_ICON[w.state] ?? ['cloud'];
    const today = this.forecast[0];
    const parts = [
      today?.temperature != null ? `最高 ${Math.round(today.temperature)}°` : '',
      today?.templow != null ? `最低 ${Math.round(today.templow)}°` : '',
      today?.precipitation_probability != null ? `降水 ${today.precipitation_probability}%` : '',
    ].filter(Boolean);
    return html`<div class="weather" data-accent=${this.config.color ?? 'blue'} @click=${() => this.moreInfo(this.config.weather)}>
      <m3e-shape shape="cookie12" size="64" spin><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
      <div>
        <div class="wtemp">${Math.round(Number(w.attributes.temperature))}°</div>
        <div class="cond">${WEATHER_LABEL[w.state] ?? w.state}</div>
        ${parts.length ? html`<div class="detail">${parts.join('・')}</div>` : nothing}
      </div>
    </div>`;
  }

  private days() {
    const hourly = this.config.forecast_type === 'hourly';
    const n = this.config.forecast_days ?? (this.footer ? 3 : 5);
    const list = hourly ? upcoming(this.hourly).slice(1, n + 1) : this.forecast.slice(1, n + 1);
    if (!n || !list.length) return nothing;
    return html`<div class="days">
      ${list.map((f) => {
        const [icon, accent] = WEATHER_ICON[f.condition ?? ''] ?? ['cloud', 'neutral'];
        const t = new Date(f.datetime);
        return html`<div class="day">
          <span class="dow">${hourly ? `${t.getHours()}時` : WEEKDAY[t.getDay()]}</span>
          <m3e-icon .icon=${icon} data-accent=${accent}></m3e-icon>
          <span class="hi">${f.temperature != null ? `${Math.round(f.temperature)}°` : '—'}</span>
          <span class="lo">${f.templow != null ? `${Math.round(f.templow)}°` : ''}</span>
        </div>`;
      })}
    </div>`;
  }

  /** Current weather as a pill: cookie with the glyph, temperature, condition and today's range. */
  private weatherNow(size = 56) {
    const w = this.stateObj(this.config.weather);
    if (!w) return nothing;
    const [icon] = WEATHER_ICON[w.state] ?? ['cloud'];
    const cond = WEATHER_LABEL[w.state] ?? w.state;
    const temp = Math.round(Number(w.attributes.temperature));
    const today = this.forecast[0];
    const range =
      today?.temperature != null && today?.templow != null
        ? `${Math.round(today.temperature)}° / ${Math.round(today.templow)}°`
        : today?.temperature != null
          ? `最高 ${Math.round(today.temperature)}°`
          : '';
    const open = () => this.moreInfo(this.config.weather);
    return html`<div
      class="now"
      data-accent=${this.config.color ?? 'blue'}
      role="button"
      tabindex="0"
      aria-label=${`天気 ${cond} ${temp}°`}
      @click=${open}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <m3e-shape shape="cookie12" size=${size} spin><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
      <span class="w">
        <span class="t">${temp}°</span>
        <span class="c">${cond}</span>
        ${range ? html`<span class="r">${range}</span>` : nothing}
      </span>
    </div>`;
  }

  private renderFooter(d: Date, time: string) {
    return html`<div class="card bar">
      <div class="clock">
        <p class="date"><span class="month">${d.getMonth() + 1}月</span>${d.getDate()}日（${WEEKDAY[d.getDay()]}）</p>
        <div class="time"><m3e-rolling-text .text=${time}></m3e-rolling-text></div>
        <p class="line2">${this.config.subtitle ?? this.config.title ?? this.defaultTitle()}</p>
      </div>
      ${this.days()} ${this.weatherNow()}
    </div>`;
  }

  /** Phones and tablets: the clock beside the weather pill, then the forecast row. */
  private renderCompact(d: Date, time: string) {
    return html`<div class="card">
      <div class="meta">
        <span>${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY[d.getDay()]}）</span>
        ${this.presence()}
      </div>
      <div class="head">
        <div class="clock">
          <div class="time"><m3e-rolling-text .text=${time}></m3e-rolling-text></div>
          <p class="title">${this.config.title ?? this.defaultTitle()}</p>
          ${this.config.subtitle ? html`<p class="subtitle">${this.config.subtitle}</p>` : nothing}
        </div>
        ${this.weatherNow(44)}
      </div>
      ${this.days()}
    </div>`;
  }

  protected renderCard() {
    const d = this.now;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (this.footer) return this.renderFooter(d, time);
    if (this.compact) return this.renderCompact(d, time);
    return html`<div class="card">
      <div class="meta">
        <span>${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY[d.getDay()]}曜日</span>
        ${this.presence()}
      </div>
      <div>
        <div class="time"><m3e-rolling-text .text=${time}></m3e-rolling-text></div>
        <p class="title">${this.config.title ?? this.defaultTitle()}</p>
        ${this.config.subtitle ? html`<p class="subtitle">${this.config.subtitle}</p>` : nothing}
      </div>
      ${this.weather()} ${this.days()}
    </div>`;
  }
}

define('m3e-hero-card', M3eHeroCard);
