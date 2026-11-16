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

/** A forecast type that failed to subscribe is tried again after this long (or on retry()). */
export const FORECAST_RETRY_MS = 5 * 60_000;

/**
 * Keeps forecast subscriptions (weather/subscribe_forecast) for one card:
 * `sync()` (re)subscribes when the entity or the wanted types change, and
 * `stop()` unsubscribes everything.
 *
 * `status` and `updatedAt` tell how the subscriptions are doing (for
 * <m3e-fetch-status>); `onStatus` runs whenever they change. A type the
 * entity doesn't offer fails on its own: the status is only "error" when no
 * type brought a forecast.
 */
export class ForecastSubscriptions {
  status: 'idle' | 'loading' | 'ok' | 'error' = 'idle';
  /** When the last forecast arrived (epoch ms). */
  updatedAt?: number;
  private subs = new Map<ForecastType, Promise<() => void>>();
  /** Types that sent a forecast, and when the others failed. */
  private received = new Set<ForecastType>();
  private failed = new Map<ForecastType, number>();
  private key = '';

  constructor(
    private readonly onForecast: (type: ForecastType, forecast: Forecast[]) => void,
    private readonly onStatus?: () => void,
  ) {}

  sync(hass: HomeAssistant | undefined, entityId: string | undefined, types: ForecastType[], now = Date.now()): void {
    if (!hass?.connection) return;
    const key = entityId ? `${entityId}|${types.join(',')}` : '';
    if (key !== this.key) {
      const entityChanged = this.key.split('|')[0] !== entityId;
      this.stop();
      if (entityChanged) this.updatedAt = undefined;
      this.key = key;
      if (entityId) for (const type of types) this.subscribe(hass, entityId, type);
      this.updateStatus();
      return;
    }
    // Same entity and types: only try a failed type again once it has rested.
    for (const [type, at] of this.failed) if (now - at >= FORECAST_RETRY_MS) this.subscribe(hass, entityId!, type);
  }

  /** Subscribe the failed types again now (the retry button). */
  retry(hass: HomeAssistant | undefined, entityId: string | undefined, types: ForecastType[]): void {
    if (!hass?.connection || !entityId) return;
    const key = `${entityId}|${types.join(',')}`;
    if (key !== this.key) {
      this.sync(hass, entityId, types);
      return;
    }
    for (const type of [...this.failed.keys()]) this.subscribe(hass, entityId, type);
  }

  stop(): void {
    for (const sub of this.subs.values()) sub.then((fn) => fn()).catch(() => {});
    this.subs.clear();
    this.received.clear();
    this.failed.clear();
    this.key = '';
  }

  private subscribe(hass: HomeAssistant, entityId: string, type: ForecastType): void {
    this.failed.delete(type);
    const sub: Promise<() => void> = hass.connection!.subscribeMessage<{ forecast: Forecast[] | null }>(
      (msg) => {
        if (this.subs.get(type) !== sub) return;
        this.received.add(type);
        this.updatedAt = Date.now();
        this.updateStatus();
        this.onForecast(type, msg.forecast ?? []);
      },
      { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entityId },
    );
    // Not supported by this weather entity, or not connected.
    sub.catch((e) => {
      if (this.subs.get(type) !== sub) return;
      console.warn(`material-3-expressive-card: ${type} forecast unavailable`, e);
      this.subs.delete(type);
      this.failed.set(type, Date.now());
      this.updateStatus();
    });
    this.subs.set(type, sub);
    this.updateStatus();
  }

  private updateStatus(): void {
    const status: ForecastSubscriptions['status'] = this.received.size
      ? 'ok'
      : this.subs.size
        ? 'loading'
        : this.failed.size
          ? 'error'
          : 'idle';
    if (status === this.status) return;
    this.status = status;
    this.onStatus?.();
  }
}

/** Forecast entries from now on (hourly lists start with past hours on some integrations). */
export function upcoming(list: Forecast[], now = Date.now()): Forecast[] {
  return list.filter((f) => Date.parse(f.datetime) + 3600_000 > now);
}
