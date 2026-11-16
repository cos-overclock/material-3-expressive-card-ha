import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { M3eBaseCard, TAP_ACTION_FIELD, actionsSection, type BaseCardConfig } from './base-card';
import { WEATHER_ICON, WEATHER_LABEL, WEEKDAY } from '../ha/labels';
import { isUnavailable } from '../ha/helpers';
import { ForecastSubscriptions, upcoming, type Forecast, type ForecastType } from '../ha/weather';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-shape';
import '../components/m3e-icon';
import '../components/m3e-fetch-status';

export interface WeatherCardConfig extends BaseCardConfig {
  /** weather.* */
  entity: string;
  name?: string;
  /** The next hours as a scrolling strip. Default true. */
  show_hourly?: boolean;
  /** How many hours. Default 12. */
  hours?: number;
  /** The next days with their temperature ranges. Default true. */
  show_daily?: boolean;
  /** How many days, today included. Default 5. */
  days?: number;
}

const round = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}°`);

/**
 * Weather in depth: the current conditions (temperature, condition, feels
 * like, humidity, wind), the next hours as a strip, and the next days with
 * bars showing each day's range against the week's.
 *
 * Motion: the weather cookie turns slowly; the hourly strip scrolls with the
 * finger; the range bars grow from their low end.
 */
export class M3eWeatherCard extends M3eBaseCard<WeatherCardConfig> {
  static override accentHint = '天気のアイコンと気温の帯の色を変えます。';

  @state() private daily: Forecast[] = [];
  @state() private hourly: Forecast[] = [];
  private forecasts = new ForecastSubscriptions(
    (type, list) => {
      if (type === 'hourly') this.hourly = list;
      else this.daily = list;
    },
    () => this.requestUpdate(),
  );
  /** Entity whose forecasts are on screen. */
  private forecastFor?: string;

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .now {
        display: flex;
        align-items: center;
        gap: 16px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .now m3e-shape {
        --m3e-shape-color: var(--accent-container);
        color: var(--accent-on-container);
        --m3e-icon-size: 36px;
      }
      .temp {
        font: 600 56px / 60px var(--m3e-font-brand);
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
      }
      .cond {
        font: 500 16px / 22px var(--m3e-font-plain);
      }
      .detail {
        font: 400 13px / 18px var(--m3e-font-plain);
        color: var(--m3-on-surface-variant);
      }
      .hours {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        margin: 0 -8px;
        padding: 0 8px;
      }
      .hours::-webkit-scrollbar {
        display: none;
      }
      .hour {
        flex: none;
        width: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
        border-radius: 14px;
        background: var(--m3-surface-high);
        scroll-snap-align: start;
        font: 500 12px / 16px var(--m3e-font-plain);
      }
      .hour .t {
        font: 600 15px / 20px var(--m3e-font-brand);
        font-variant-numeric: tabular-nums;
      }
      .hour m3e-icon,
      .day m3e-icon {
        --m3e-icon-size: 22px;
        color: var(--m3-on-surface-variant);
      }
      .hour m3e-icon[data-accent]:not([data-accent='neutral']),
      .day m3e-icon[data-accent]:not([data-accent='neutral']) {
        color: var(--accent-fill);
      }
      .pop {
        font: 500 11px / 14px var(--m3e-font-brand);
        color: var(--acc-blue);
        min-height: 14px;
      }
      .days {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .day {
        display: grid;
        grid-template-columns: 3.2em 24px 3em 2.6em 1fr 2.6em;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        font: 500 14px / 20px var(--m3e-font-plain);
      }
      .day .lo,
      .day .hi {
        font: 500 14px / 20px var(--m3e-font-brand);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .day .lo {
        color: var(--m3-on-surface-variant);
      }
      .range {
        display: block;
        position: relative;
        height: 6px;
        border-radius: 3px;
        background: var(--m3-surface-high);
      }
      .range i {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: 3px;
        background: linear-gradient(90deg, var(--acc-sky), var(--acc-peach));
        transform-origin: left;
        animation: grow var(--m3e-spatial-slow) both;
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .range i {
          animation: none;
        }
      }
      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 16px;
        gap: 12px;
      }
      :host([compact]) .temp {
        font: 600 44px / 48px var(--m3e-font-brand);
      }
      :host([compact]) .now m3e-shape {
        --m3e-icon-size: 30px;
      }
      :host([compact]) .hour {
        width: 46px;
      }
      :host([compact]) .day {
        min-height: 34px;
        font-size: 13px;
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const entity = Object.keys(hass.states).find((id) => id.startsWith('weather.')) ?? 'weather.home';
    return { type: 'custom:m3e-weather-card', entity };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'weather' } } },
        { name: 'name', selector: { text: {} } },
        { name: 'show_hourly', default: true, selector: { boolean: {} } },
        { name: 'hours', selector: { number: { min: 3, max: 48, mode: 'box' } } },
        { name: 'show_daily', default: true, selector: { boolean: {} } },
        { name: 'days', selector: { number: { min: 2, max: 10, mode: 'box' } } },
        actionsSection(TAP_ACTION_FIELD),
      ],
      computeLabel: (s: { name: string }) =>
        ({ show_hourly: '1時間ごとの予報', hours: '時間数', show_daily: '日ごとの予報', days: '日数（今日を含む）' })[s.name],
    };
  }

  protected normalizeConfig(config: WeatherCardConfig): WeatherCardConfig {
    if (!config.entity) throw new Error('entity is required');
    if (!config.entity.startsWith('weather.')) throw new Error('entity must be a weather entity');
    return config;
  }

  protected watchedEntities(): string[] {
    return [this.config.entity];
  }

  protected override defaultAccent(): Accent {
    return 'blue';
  }

  /** Hourly entries drop off as the hours pass. */
  protected override clockInterval(): number {
    return 60_000;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  override getCardSize(): number {
    return 7;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.forecasts.stop();
  }

  private forecastTypes(): ForecastType[] {
    const types: ForecastType[] = [];
    if (this.config.show_daily !== false) types.push('daily');
    if (this.config.show_hourly !== false) types.push('hourly');
    return types;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    // Another weather entity: its forecasts replace the old ones, which must not stay up meanwhile.
    if (this.forecastFor !== this.config.entity) {
      this.forecastFor = this.config.entity;
      this.daily = [];
      this.hourly = [];
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.forecasts.sync(this.hass, this.config.entity, this.forecastTypes());
  }

  private readonly retry = () => this.forecasts.retry(this.hass, this.config.entity, this.forecastTypes());

  private renderHours() {
    const list = upcoming(this.hourly, this.clockNow).slice(0, this.config.hours ?? 12);
    if (!list.length) return nothing;
    return html`<div class="hours" role="list" aria-label="1時間ごとの予報">
      ${list.map((f, i) => {
        const [icon, accent] = WEATHER_ICON[f.condition ?? ''] ?? ['cloud', 'neutral'];
        const h = new Date(f.datetime).getHours();
        return html`<div class="hour" role="listitem">
          <span>${i === 0 ? '今' : `${h}時`}</span>
          <m3e-icon .icon=${icon} data-accent=${accent} aria-label=${WEATHER_LABEL[f.condition ?? ''] ?? ''}></m3e-icon>
          <span class="t">${round(f.temperature)}</span>
          <span class="pop">${f.precipitation_probability ? `${f.precipitation_probability}%` : ''}</span>
        </div>`;
      })}
    </div>`;
  }

  private renderDays() {
    const list = this.daily.slice(0, this.config.days ?? 5);
    if (!list.length) return nothing;
    const lows = list.map((f) => Number(f.templow ?? f.temperature));
    const highs = list.map((f) => Number(f.temperature));
    const min = Math.min(...lows.filter(Number.isFinite));
    const max = Math.max(...highs.filter(Number.isFinite));
    const span = max - min || 1;
    const today = new Date(this.clockNow).toDateString();
    return html`<div class="days" role="list" aria-label="日ごとの予報">
      ${list.map((f) => {
        const [icon, accent] = WEATHER_ICON[f.condition ?? ''] ?? ['cloud', 'neutral'];
        const d = new Date(f.datetime);
        const label = d.toDateString() === today ? '今日' : WEEKDAY[d.getDay()];
        const lo = Number(f.templow ?? f.temperature);
        const hi = Number(f.temperature);
        const left = Number.isFinite(lo) ? ((lo - min) / span) * 100 : 0;
        const width = Number.isFinite(lo) && Number.isFinite(hi) ? Math.max(4, ((hi - lo) / span) * 100) : 0;
        return html`<div class="day" role="listitem">
          <span>${label}</span>
          <m3e-icon .icon=${icon} data-accent=${accent} aria-label=${WEATHER_LABEL[f.condition ?? ''] ?? ''}></m3e-icon>
          <span class="pop">${f.precipitation_probability ? `${f.precipitation_probability}%` : ''}</span>
          <span class="lo">${f.templow != null ? round(f.templow) : ''}</span>
          <span class="range"><i style="left:${left}%;width:${width}%"></i></span>
          <span class="hi">${round(f.temperature)}</span>
        </div>`;
      })}
    </div>`;
  }

  protected renderCard() {
    const w = this.stateObj(this.config.entity);
    if (!w) return html`<div class="card unavailable"></div>`;
    const a = w.attributes;
    const [icon] = WEATHER_ICON[w.state] ?? ['cloud'];
    const cond = WEATHER_LABEL[w.state] ?? w.state;
    const today = this.daily[0];
    const detail = [
      a.apparent_temperature != null ? `体感 ${round(a.apparent_temperature)}` : '',
      today?.temperature != null && today?.templow != null ? `${round(today.temperature)} / ${round(today.templow)}` : '',
      a.humidity != null ? `湿度 ${Math.round(a.humidity)}%` : '',
      a.wind_speed != null ? `風 ${Math.round(a.wind_speed)}${a.wind_speed_unit ?? 'km/h'}` : '',
    ]
      .filter(Boolean)
      .join('・');
    const showHourly = this.config.show_hourly !== false;
    const showDaily = this.config.show_daily !== false;
    return html`<div class="card ${isUnavailable(w) ? 'unavailable' : ''}">
      <div class="now" role="button" tabindex="0" aria-label="天気 ${cond} ${round(a.temperature)}" @click=${() => this.tapEntity(this.config.entity)}>
        <m3e-shape shape="cookie12" size=${this.compact ? 60 : 76} spin><m3e-icon .icon=${icon}></m3e-icon></m3e-shape>
        <div>
          <div class="temp">${round(a.temperature)}</div>
          <div class="cond">${this.config.name ? `${this.config.name}・` : ''}${cond}</div>
          ${detail ? html`<div class="detail">${detail}</div>` : nothing}
        </div>
      </div>
      ${showHourly ? this.renderHours() : nothing} ${showDaily ? this.renderDays() : nothing}
      ${showHourly || showDaily
        ? html`<m3e-fetch-status
            .view=${{
              status: this.forecasts.status,
              updatedAt: this.forecasts.updatedAt,
              hasData: this.hourly.length + this.daily.length > 0,
            }}
            subject="予報"
            @retry=${this.retry}
          ></m3e-fetch-status>`
        : nothing}
    </div>`;
  }
}

define('m3e-weather-card', M3eWeatherCard);
