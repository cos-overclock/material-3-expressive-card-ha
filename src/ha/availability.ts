import { areaName, domainOf, friendlyName } from './helpers';
import type { HomeAssistant } from './types';

/** Domains that do not determine whether a device is reachable. */
export const IGNORED_DOMAINS = new Set([
  'button',
  'event',
  'update',
  'scene',
  'image',
  'notify',
  'tts',
  'stt',
  'conversation',
  'automation',
  'script',
  'zone',
  'person',
  'sun',
  'group',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'input_datetime',
  'input_button',
  'counter',
  'timer',
  'schedule',
  'tag',
]);

/** HA helper platforms attached to devices that keep a state when the device is offline. */
export const HELPER_PLATFORMS = new Set([
  'utility_meter',
  'template',
  'derivative',
  'integration',
  'statistics',
  'min_max',
  'group',
  'threshold',
  'filter',
  'trend',
  'switch_as_x',
  'history_stats',
  'counter',
  'compensation',
]);

/** Domain preference when picking the representative entity of a device. */
export const PRIMARY_ORDER = [
  'camera',
  'climate',
  'light',
  'cover',
  'lock',
  'media_player',
  'fan',
  'vacuum',
  'switch',
  'binary_sensor',
  'sensor',
];

export interface OfflineItem {
  /** `device:<id>` when grouped by device, else `entity:<id>`. */
  key: string;
  /** Representative entity ID (used for more-info and history lookup). */
  entity: string;
  deviceId?: string;
  name: string;
  /** Number of unavailable entities represented by this row. */
  count: number;
  /** Epoch ms from `last_changed` (earliest among device entities), or NaN. */
  since: number;
  area?: string;
}

export interface MuteEntry {
  /** Epoch ms when the mute expires, or `null` for until-back / permanent. */
  until: number | null;
  at: number;
  permanent?: boolean;
}

export type MuteMap = Record<string, MuteEntry>;

export interface MuteOption {
  id: string;
  label: string;
  durationMs: number | null;
  permanent?: boolean;
}

export const MUTE_OPTIONS: MuteOption[] = [
  { id: '1h', label: '1時間', durationMs: 3_600_000 },
  { id: '24h', label: '24時間', durationMs: 86_400_000 },
  { id: '7d', label: '7日間', durationMs: 7 * 86_400_000 },
  { id: 'until_back', label: '復旧まで', durationMs: null },
  { id: 'permanent', label: 'ずっと', durationMs: null, permanent: true },
];

export function pickPrimaryEntity(entityIds: string[]): string {
  for (const domain of PRIMARY_ORDER) {
    const hit = entityIds.find((id) => id.startsWith(`${domain}.`));
    if (hit) return hit;
  }
  return [...entityIds].sort()[0] ?? entityIds[0];
}

/**
 * Collects unavailable entities, grouped by HA device when `groupByDevice` is
 * true (default). A device counts as offline only when every non-helper,
 * visible entity belonging to it is `unavailable`.
 */
export function collectUnavailable(
  hass: HomeAssistant,
  opts: { exclude?: RegExp[]; groupByDevice?: boolean } = {},
): OfflineItem[] {
  const group = opts.groupByDevice !== false;
  const exclude = opts.exclude ?? [];
  const reg = hass.entities;
  const devices = hass.devices;
  const byDevice = new Map<string, string[]>();
  const out: OfflineItem[] = [];

  for (const id in hass.states) {
    if (exclude.some((re) => re.test(id))) continue;
    if (IGNORED_DOMAINS.has(domainOf(id))) continue;
    const entry = reg?.[id];
    if (entry?.hidden || entry?.hidden_by || entry?.entity_category) continue;
    if (entry?.platform && HELPER_PLATFORMS.has(entry.platform)) continue;

    if (group && entry?.device_id) {
      let list = byDevice.get(entry.device_id);
      if (!list) {
        list = [];
        byDevice.set(entry.device_id, list);
      }
      list.push(id);
      continue;
    }

    const s = hass.states[id];
    if (s.state !== 'unavailable') continue;
    out.push({
      key: `entity:${id}`,
      entity: id,
      name: friendlyName(s, id) || id,
      count: 1,
      since: Date.parse(s.last_changed),
      area: areaName(hass, id),
    });
  }

  for (const [deviceId, ids] of byDevice) {
    if (!ids.every((id) => hass.states[id]?.state === 'unavailable')) continue;
    const primary = pickPrimaryEntity(ids);
    const dev = devices?.[deviceId];
    const name = dev?.name_by_user || dev?.name || friendlyName(hass.states[primary], primary) || primary;
    let earliest = Infinity;
    for (const id of ids) {
      const t = Date.parse(hass.states[id]?.last_changed ?? '');
      if (Number.isFinite(t) && t > 0 && t < earliest) earliest = t;
    }
    out.push({
      key: `device:${deviceId}`,
      entity: primary,
      deviceId,
      name,
      count: ids.length,
      since: Number.isFinite(earliest) ? earliest : NaN,
      area: areaName(hass, primary),
    });
  }

  return out.sort((a, b) => {
    const aValid = Number.isFinite(a.since) && a.since > 0;
    const bValid = Number.isFinite(b.since) && b.since > 0;
    if (aValid && bValid && a.since !== b.since) return a.since - b.since;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}

export function isMuted(entry: MuteEntry | undefined, now = Date.now()): boolean {
  if (!entry) return false;
  if (entry.permanent || entry.until === null) return true;
  return entry.until > now;
}

/** Removes expired mutes and non-permanent mutes whose device is back online. */
export function pruneMutes(
  mutes: MuteMap,
  offlineKeys: ReadonlySet<string>,
  now = Date.now(),
): { next: MuteMap; changed: boolean } {
  const next: MuteMap = {};
  let changed = false;
  for (const [key, entry] of Object.entries(mutes)) {
    if (entry.permanent) {
      next[key] = entry;
      continue;
    }
    if (!offlineKeys.has(key) || (entry.until !== null && entry.until <= now)) {
      changed = true;
      continue;
    }
    next[key] = entry;
  }
  return { next, changed };
}
