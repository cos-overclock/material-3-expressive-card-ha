/**
 * Energy data the way HA's own energy dashboard gets it: the sources and
 * devices from the energy preferences (energy/get_prefs), and their hourly or
 * daily changes from long-term statistics (recorder/statistics_during_period).
 */
import type { HomeAssistant } from './types';

export interface EnergyDevice {
  stat: string;
  name?: string;
}

export interface EnergySources {
  grid_in: string[];
  grid_out: string[];
  solar: string[];
  battery_in: string[];
  battery_out: string[];
  devices: EnergyDevice[];
}

interface EnergyPrefs {
  energy_sources: {
    type: 'grid' | 'solar' | 'battery' | 'gas' | 'water';
    flow_from?: { stat_energy_from: string }[];
    flow_to?: { stat_energy_to: string }[];
    stat_energy_from?: string;
    stat_energy_to?: string;
  }[];
  device_consumption: { stat_consumption: string; name?: string; included_in_stat?: string }[];
}

/**
 * How long fetched energy settings are reused. The cards refetch their data every
 * few minutes, so a change made in HA's energy settings shows up within this time.
 */
export const PREFS_TTL_MS = 5 * 60_000;

const prefsCache = new WeakMap<object, { at: number; promise: Promise<EnergySources | undefined> }>();

/**
 * Energy sources and devices from HA's energy settings, cached per connection for
 * PREFS_TTL_MS. A failed fetch isn't cached, so the next call asks HA again.
 */
export function energySources(hass: HomeAssistant, now = Date.now()): Promise<EnergySources | undefined> {
  const key = (hass.connection ?? hass) as object;
  const hit = prefsCache.get(key);
  if (hit && now - hit.at < PREFS_TTL_MS) return hit.promise;
  const entry = {
    at: now,
    promise: (async (): Promise<EnergySources | undefined> => {
      if (!hass.callWS) return undefined;
      try {
        const prefs = await hass.callWS<EnergyPrefs>({ type: 'energy/get_prefs' });
        const out: EnergySources = { grid_in: [], grid_out: [], solar: [], battery_in: [], battery_out: [], devices: [] };
        for (const src of prefs.energy_sources) {
          if (src.type === 'grid') {
            // HA 2026.x: one import/export pair per grid source. Older HA: flow_from / flow_to lists.
            if (src.stat_energy_from) out.grid_in.push(src.stat_energy_from);
            if (src.stat_energy_to) out.grid_out.push(src.stat_energy_to);
            src.flow_from?.forEach((f) => out.grid_in.push(f.stat_energy_from));
            src.flow_to?.forEach((f) => out.grid_out.push(f.stat_energy_to));
          } else if (src.type === 'solar' && src.stat_energy_from) out.solar.push(src.stat_energy_from);
          else if (src.type === 'battery') {
            if (src.stat_energy_from) out.battery_out.push(src.stat_energy_from);
            if (src.stat_energy_to) out.battery_in.push(src.stat_energy_to);
          }
        }
        // Only top-level devices: children are already counted in their parent.
        out.devices = prefs.device_consumption
          .filter((d) => !d.included_in_stat)
          .map((d) => ({ stat: d.stat_consumption, name: d.name }));
        return out;
      } catch (e) {
        console.warn('material-3-expressive-card: energy preferences unavailable', e);
        return undefined;
      }
    })(),
  };
  prefsCache.set(key, entry);
  // Forget a failure (once it is still the cached entry) so the next call retries.
  entry.promise.then((v) => {
    if (v === undefined && prefsCache.get(key) === entry) prefsCache.delete(key);
  });
  return entry.promise;
}

/** Config overrides on top of the energy settings. */
export function mergeSources(base: EnergySources | undefined, override: Partial<Record<keyof EnergySources, unknown>> | undefined): EnergySources {
  const list = (v: unknown): string[] | undefined => (v === undefined ? undefined : ([v].flat().filter(Boolean) as string[]));
  const b = base ?? { grid_in: [], grid_out: [], solar: [], battery_in: [], battery_out: [], devices: [] };
  const o = override ?? {};
  return {
    grid_in: list(o.grid_in) ?? b.grid_in,
    grid_out: list(o.grid_out) ?? b.grid_out,
    solar: list(o.solar) ?? b.solar,
    battery_in: list(o.battery_in) ?? b.battery_in,
    battery_out: list(o.battery_out) ?? b.battery_out,
    devices: o.devices
      ? (o.devices as (string | EnergyDevice)[]).map((d) => (typeof d === 'string' ? { stat: d } : d))
      : b.devices,
  };
}

/**
 * The energy settings with the config's overrides on top. Throws when HA's
 * settings couldn't be read and the config names no source of its own, so a
 * card can show "couldn't fetch" instead of an empty chart.
 */
export async function loadSources(
  hass: HomeAssistant,
  override: Partial<Record<keyof EnergySources, unknown>> | undefined,
): Promise<EnergySources> {
  const base = await energySources(hass);
  if (!base && !Object.values(override ?? {}).some((v) => v !== undefined)) throw new Error('energy settings unavailable');
  return mergeSources(base, override);
}

export const allStats = (s: EnergySources) => [
  ...new Set([...s.grid_in, ...s.grid_out, ...s.solar, ...s.battery_in, ...s.battery_out, ...s.devices.map((d) => d.stat)]),
];

export type Period = 'hour' | 'day' | 'week' | 'month';

/**
 * kWh per bucket for each statistic: `buckets` evenly spaced periods from
 * `start`. Missing buckets are 0.
 */
export async function statChanges(
  hass: HomeAssistant,
  ids: string[],
  start: Date,
  end: Date,
  period: Period,
  buckets: number,
): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  ids.forEach((id) => (out[id] = Array(buckets).fill(0)));
  if (!hass.callWS || !ids.length) return out;
  const res = await hass.callWS<Record<string, { start: number | string; change?: number | null }[]>>({
    type: 'recorder/statistics_during_period',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    statistic_ids: ids,
    period,
    types: ['change'],
    units: { energy: 'kWh' },
  });
  const t0 = start.getTime();
  for (const id of ids) {
    for (const row of res?.[id] ?? []) {
      const t = typeof row.start === 'number' ? row.start : Date.parse(row.start);
      const i = bucketIndex(t, t0, period);
      if (i >= 0 && i < buckets && row.change != null) out[id][i] += row.change;
    }
  }
  return out;
}

function bucketIndex(t: number, t0: number, period: Period): number {
  if (period === 'hour') return Math.round((t - t0) / 3600_000);
  if (period === 'day') return Math.round((t - t0) / 86400_000);
  if (period === 'week') return Math.round((t - t0) / (7 * 86400_000));
  const a = new Date(t0);
  const b = new Date(t);
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Element-wise sum of several series. */
export function addSeries(data: Record<string, number[]>, ids: string[], n: number): number[] {
  const out = Array(n).fill(0);
  for (const id of ids) data[id]?.forEach((v, i) => (out[i] += v));
  return out;
}

export interface Flows {
  solar: number;
  gridIn: number;
  gridOut: number;
  batteryIn: number;
  batteryOut: number;
  solarToHome: number;
  solarToBattery: number;
  solarToGrid: number;
  gridToHome: number;
  gridToBattery: number;
  batteryToHome: number;
  batteryToGrid: number;
  home: number;
  /** Share of home use not bought from the grid, 0..1. */
  selfSufficiency: number;
}

/** Split totals into flows. Solar charges the battery first, then exports; the battery covers the rest of an export. */
export function flows(t: { solar: number; gridIn: number; gridOut: number; batteryIn: number; batteryOut: number }): Flows {
  const solarToBattery = Math.min(t.batteryIn, t.solar);
  const gridToBattery = Math.max(0, t.batteryIn - solarToBattery);
  const solarToGrid = Math.min(t.gridOut, t.solar - solarToBattery);
  const batteryToGrid = Math.max(0, t.gridOut - solarToGrid);
  const solarToHome = Math.max(0, t.solar - solarToBattery - solarToGrid);
  const batteryToHome = Math.max(0, t.batteryOut - batteryToGrid);
  const gridToHome = Math.max(0, t.gridIn - gridToBattery);
  const home = solarToHome + batteryToHome + gridToHome;
  return {
    ...t,
    solarToHome,
    solarToBattery,
    solarToGrid,
    gridToHome,
    gridToBattery,
    batteryToHome,
    batteryToGrid,
    home,
    selfSufficiency: home > 0 ? (solarToHome + batteryToHome) / home : 0,
  };
}

/** "8.6", "12", "0.82" */
export function kwh(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : v.toFixed(1);
}

/** Start of today, this week (Monday) or this month, and how many buckets of `period` fit until the end of it. */
export function range(kind: 'day' | 'week' | 'month', now = new Date()): { start: Date; end: Date; period: Period; buckets: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (kind === 'day') {
    const end = new Date(start.getTime() + 86400_000);
    return { start, end, period: 'hour', buckets: 24 };
  }
  if (kind === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return { start, end: new Date(start.getTime() + 7 * 86400_000), period: 'day', buckets: 7 };
  }
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end, period: 'day', buckets: Math.round((end.getTime() - start.getTime()) / 86400_000) };
}
