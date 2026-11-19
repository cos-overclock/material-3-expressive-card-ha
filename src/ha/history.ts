import type { HomeAssistant } from './types';

/** [time ms, value] */
export type Point = [number, number];

/** Windows longer than this use HA long-term statistics instead of raw state history. */
export const LONG_TERM_THRESHOLD_HOURS = 48;

/** Windows longer than this (30 days) use daily statistics buckets instead of hourly. */
export const DAILY_STATS_THRESHOLD_HOURS = 720;

interface CompressedState {
  s: string;
  /** last_updated / last_changed, epoch seconds */
  lu?: number;
  lc?: number;
}

interface StatRow {
  start: number | string;
  end?: number | string;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  state?: number | null;
}

export interface SensorHistoryResult {
  points: Point[];
  /** True recorded min/max across statistics buckets (preserves intra-bucket peaks). */
  min?: number;
  max?: number;
  source: 'history' | 'statistics';
}

/**
 * Numeric history for some entities over the last `hours`, via the
 * history/history_during_period websocket command (minimal, no attributes).
 */
export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  hours: number,
  now = Date.now(),
): Promise<Record<string, Point[]>> {
  if (!hass.callWS || !entityIds.length) return {};
  const end = new Date(now);
  const start = new Date(now - hours * 3600_000);
  const res = await hass.callWS<Record<string, CompressedState[]>>({
    type: 'history/history_during_period',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  const out: Record<string, Point[]> = {};
  for (const id of entityIds) {
    out[id] = (res?.[id] ?? [])
      .map((h): Point => [((h.lu ?? h.lc ?? 0) as number) * 1000, Number(h.s)])
      .filter(([t, v]) => t > 0 && Number.isFinite(v));
  }
  return out;
}

/**
 * Long-term statistics (`recorder/statistics_during_period`) for one entity over
 * the last `hours`. Uses `hour` buckets up to 30 days and `day` beyond that.
 */
export async function fetchStatistics(
  hass: HomeAssistant,
  entityId: string,
  hours: number,
  now = Date.now(),
): Promise<SensorHistoryResult> {
  if (!hass.callWS) return { points: [], source: 'statistics' };
  const end = new Date(now);
  const start = new Date(now - hours * 3600_000);
  const period = hours > DAILY_STATS_THRESHOLD_HOURS ? 'day' : 'hour';
  const res = await hass.callWS<Record<string, StatRow[]>>({
    type: 'recorder/statistics_during_period',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    statistic_ids: [entityId],
    period,
    types: ['mean', 'min', 'max', 'state'],
  });
  const points: Point[] = [];
  let min: number | undefined;
  let max: number | undefined;
  for (const r of res?.[entityId] ?? []) {
    const rawT = typeof r.start === 'number' ? r.start : Date.parse(String(r.start ?? ''));
    const t = Number.isFinite(rawT) && rawT > 0 ? (rawT < 1e12 ? rawT * 1000 : rawT) : 0;
    const v = r.mean ?? r.state;
    if (t <= 0 || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const rMin = typeof r.min === 'number' && Number.isFinite(r.min) ? r.min : v;
    const rMax = typeof r.max === 'number' && Number.isFinite(r.max) ? r.max : v;
    min = min === undefined ? rMin : Math.min(min, rMin);
    max = max === undefined ? rMax : Math.max(max, rMax);
    points.push([t, v]);
  }
  points.sort((a, b) => a[0] - b[0]);
  return { points, min, max, source: 'statistics' };
}

/**
 * Sensor history for the given window: raw state history up to 48 hours, and
 * long-term statistics beyond that with automatic fallback to raw history when
 * statistics are absent or unsupported.
 */
export async function fetchSensorHistory(
  hass: HomeAssistant,
  entityId: string,
  hours: number,
  now = Date.now(),
): Promise<SensorHistoryResult> {
  if (hours <= LONG_TERM_THRESHOLD_HOURS) {
    const points = (await fetchHistory(hass, [entityId], hours, now))[entityId] ?? [];
    return { points, source: 'history' };
  }
  try {
    const stats = await fetchStatistics(hass, entityId, hours, now);
    if (stats.points.length > 0) return stats;
  } catch {
    /* statistics unavailable for this entity or period; fall back to raw history */
  }
  const points = (await fetchHistory(hass, [entityId], hours, now))[entityId] ?? [];
  return { points, source: 'history' };
}

/**
 * Resample a step series into `n` evenly spaced buckets between start and
 * end: each bucket is the time-weighted mean of the value held during it.
 */
export function resample(points: Point[], start: number, end: number, n: number): (number | null)[] {
  const out: (number | null)[] = [];
  if (!points.length) return Array(n).fill(null);
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const step = (end - start) / n;
  let i = 0;
  let current: number | null = null;
  // value held at `start`
  while (i < sorted.length && sorted[i][0] <= start) current = sorted[i++][1];
  for (let b = 0; b < n; b++) {
    const b0 = start + b * step;
    const b1 = b0 + step;
    let acc = 0;
    let dur = 0;
    let t = b0;
    while (i < sorted.length && sorted[i][0] < b1) {
      if (current !== null) {
        acc += current * (sorted[i][0] - t);
        dur += sorted[i][0] - t;
      }
      t = sorted[i][0];
      current = sorted[i++][1];
    }
    if (current !== null) {
      acc += current * (b1 - t);
      dur += b1 - t;
    }
    out.push(dur > 0 ? acc / dur : null);
  }
  return out;
}
