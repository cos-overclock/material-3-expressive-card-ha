import type { HomeAssistant } from './types';

/** [time ms, value] */
export type Point = [number, number];

interface CompressedState {
  s: string;
  /** last_updated / last_changed, epoch seconds */
  lu?: number;
  lc?: number;
}

/**
 * Numeric history for some entities over the last `hours`, via the
 * history/history_during_period websocket command (minimal, no attributes).
 */
export async function fetchHistory(hass: HomeAssistant, entityIds: string[], hours: number): Promise<Record<string, Point[]>> {
  if (!hass.callWS || !entityIds.length) return {};
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
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
