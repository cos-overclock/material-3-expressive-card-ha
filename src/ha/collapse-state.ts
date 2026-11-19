import type { HomeAssistant } from './types';
import { loadUserData, readLocal, saveUserData, writeLocal } from './user-data';

export type CollapseMemory = 'user' | 'device' | 'session';

export interface CollapseTarget {
  entity?: string;
  storageKey: string;
  defaultCollapsed?: boolean;
  memory?: CollapseMemory;
}

function readSession(key: string): boolean | undefined {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* sessionStorage disabled */
  }
  return undefined;
}

function writeSession(key: string, collapsed: boolean): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, collapsed ? '1' : '0');
  } catch {
    /* sessionStorage disabled */
  }
}

/**
 * Synchronous collapse state read from an HA helper entity, `sessionStorage`,
 * or `localStorage` (`user` falls back to `localStorage` until HA responds).
 */
export function readCollapsedSync(hass: HomeAssistant | undefined, target: CollapseTarget): boolean {
  if (target.entity) {
    const st = hass?.states[target.entity]?.state;
    if (st === 'on') return true;
    if (st === 'off') return false;
    return target.defaultCollapsed ?? false;
  }
  if (target.memory === 'session') {
    return readSession(target.storageKey) ?? target.defaultCollapsed ?? false;
  }
  const stored = readLocal<boolean | string>(target.storageKey);
  if (typeof stored === 'boolean') return stored;
  if (stored === '1') return true;
  if (stored === '0') return false;
  return target.defaultCollapsed ?? false;
}

/** Loads HA user-data collapse preference when `memory === 'user'`. */
export async function loadCollapsed(hass: HomeAssistant | undefined, target: CollapseTarget): Promise<boolean | undefined> {
  if (target.entity || target.memory !== 'user') return undefined;
  const val = await loadUserData<boolean>(hass, target.storageKey);
  return typeof val === 'boolean' ? val : undefined;
}

/** Persists collapse state to the configured HA entity or storage backend. */
export function writeCollapsed(hass: HomeAssistant | undefined, target: CollapseTarget, collapsed: boolean): void {
  if (target.entity) {
    void hass?.callService('homeassistant', collapsed ? 'turn_on' : 'turn_off', {}, { entity_id: target.entity });
    return;
  }
  if (target.memory === 'session') {
    writeSession(target.storageKey, collapsed);
    return;
  }
  if (target.memory === 'user') {
    void saveUserData(hass, target.storageKey, collapsed);
    return;
  }
  writeLocal(target.storageKey, collapsed);
}
