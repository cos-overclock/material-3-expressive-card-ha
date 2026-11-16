import type { HomeAssistant } from './types';

export interface Forecast {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation_probability?: number;
  precipitation?: number;
  humidity?: number;
  wind_speed?: number;
  is_daytime?: boolean;
}

export type ForecastType = 'daily' | 'hourly' | 'twice_daily';

/**
 * Keeps forecast subscriptions (weather/subscribe_forecast) for one card:
 * `sync()` (re)subscribes when the entity or the wanted types change, and
 * `stop()` unsubscribes everything.
 */
export class ForecastSubscriptions {
  private subs = new Map<ForecastType, Promise<() => void>>();
  private key = '';

  constructor(private readonly onForecast: (type: ForecastType, forecast: Forecast[]) => void) {}

  sync(hass: HomeAssistant | undefined, entityId: string | undefined, types: ForecastType[]): void {
    const key = entityId ? `${entityId}|${types.join(',')}` : '';
    if (key === this.key || !hass?.connection) return;
    this.stop();
    if (!entityId) return;
    this.key = key;
    for (const type of types) {
      const sub = hass.connection.subscribeMessage<{ forecast: Forecast[] | null }>(
        (msg) => this.onForecast(type, msg.forecast ?? []),
        { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entityId },
      );
      // Not supported by this weather entity (or not connected): try again on the next sync.
      sub.catch(() => (this.key = ''));
      this.subs.set(type, sub);
    }
  }

  stop(): void {
    for (const sub of this.subs.values()) sub.then((fn) => fn()).catch(() => {});
    this.subs.clear();
    this.key = '';
  }
}

/** Forecast entries from now on (hourly lists start with past hours on some integrations). */
export function upcoming(list: Forecast[], now = Date.now()): Forecast[] {
  return list.filter((f) => Date.parse(f.datetime) + 3600_000 > now);
}
