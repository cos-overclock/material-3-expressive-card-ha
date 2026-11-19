import type { HomeAssistant } from './types';

export interface MinimalHistoryRow {
  s?: string | null;
  /** Epoch seconds (`last_changed` / `last_updated`). */
  lc?: number;
  lu?: number;
}

export interface OfflineSince {
  /** Epoch ms when the current unavailable streak began, if known. */
  at?: number;
  /** True when the entity was already unavailable at the start of the history window. */
  older: boolean;
}

const MISSING_STATES = new Set(['unavailable', 'unknown', '']);

/**
 * Finds when the trailing `unavailable`/`unknown` streak actually started from
 * minimal history rows, surviving Home Assistant restarts (which rewrite
 * `unavailable` and reset `last_changed`).
 */
export function realUnavailableSince(rows: MinimalHistoryRow[], windowStart: number): OfflineSince {
  let start: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.s != null && !MISSING_STATES.has(row.s)) break;
    const raw = row.lc ?? row.lu;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      start = raw < 1e12 ? raw * 1000 : raw;
    }
  }
  if (start === undefined) return { older: false };
  if (start <= windowStart + 60_000) return { at: start, older: true };
  return { at: start, older: false };
}

/**
 * Reads when each unavailable entity really went offline in a single recorder
 * call. Returns an empty Map if the recorder is unavailable or errors.
 */
export async function fetchUnavailableSince(
  hass: HomeAssistant | undefined,
  entityIds: string[],
  days = 7,
  now = Date.now(),
): Promise<Map<string, OfflineSince>> {
  const out = new Map<string, OfflineSince>();
  if (!hass?.callWS || !entityIds.length) return out;
  const windowStart = now - days * 86_400_000;
  try {
    const res = await hass.callWS<Record<string, MinimalHistoryRow[]>>({
      type: 'history/history_during_period',
      start_time: new Date(windowStart).toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: entityIds,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
    for (const id of entityIds) {
      out.set(id, realUnavailableSince(res?.[id] ?? [], windowStart));
    }
  } catch {
    /* recorder unavailable: fall back to entity last_changed */
  }
  return out;
}

/** Human-readable offline duration in Japanese ("14分前", "3時間前", "2日前", "7日以上前"). */
export function formatOfflineDuration(
  sinceMs: number,
  now = Date.now(),
  opts: { older?: boolean; windowDays?: number } = {},
): string {
  if (opts.older) return `${opts.windowDays ?? 7}日以上前`;
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) return '利用不可';
  const mins = Math.max(0, Math.floor((now - sinceMs) / 60_000));
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
