import type { HomeAssistant } from './types';

/** Read JSON-serialized state from localStorage without throwing in restricted modes. */
export function readLocal<T>(key: string): T | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw != null ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Write JSON-serialized state to localStorage without throwing in restricted modes. */
export function writeLocal(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full */
  }
}

/**
 * Load per-user preference from Home Assistant (`frontend/get_user_data`),
 * caching locally and falling back to `localStorage` if unavailable.
 */
export async function loadUserData<T>(hass: HomeAssistant | undefined, key: string): Promise<T | undefined> {
  if (hass?.callWS) {
    try {
      const res = await hass.callWS<{ value?: T | null } | null>({ type: 'frontend/get_user_data', key });
      if (res?.value != null) {
        writeLocal(key, res.value);
        return res.value;
      }
      return readLocal<T>(key);
    } catch {
      return readLocal<T>(key);
    }
  }
  return readLocal<T>(key);
}

/**
 * Save per-user preference immediately to `localStorage` and sync to
 * Home Assistant (`frontend/set_user_data`) when connected.
 */
export async function saveUserData(hass: HomeAssistant | undefined, key: string, value: unknown): Promise<void> {
  writeLocal(key, value);
  if (!hass?.callWS) return;
  try {
    await hass.callWS({ type: 'frontend/set_user_data', key, value });
  } catch {
    /* local copy already persisted */
  }
}
