import type { ActionConfig, HapticType, HassEntity, HomeAssistant } from './types';

export const domainOf = (entityId: string) => entityId.split('.')[0];

/** Fire HA's more-info dialog for an entity. */
export function fireMoreInfo(node: HTMLElement, entityId: string): void {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

/** Ask HA's companion app to vibrate (ignored in a desktop browser). */
export function fireHaptic(node: HTMLElement, type: HapticType): void {
  node.dispatchEvent(new CustomEvent('haptic', { detail: type, bubbles: true, composed: true }));
}

/**
 * Hand an action to HA's frontend, which runs every action type (navigate, url,
 * perform-action, assist…), asks for confirmation and vibrates as configured.
 */
export function fireAction(node: HTMLElement, action: ActionConfig, entityId?: string): void {
  node.dispatchEvent(
    new CustomEvent('hass-action', {
      detail: { config: { entity: entityId, tap_action: action }, action: 'tap' },
      bubbles: true,
      composed: true,
    }),
  );
}

const ON_STATES = new Set(['on', 'open', 'opening', 'unlocked', 'playing', 'home', 'heat', 'cool', 'dry', 'fan_only', 'auto', 'heat_cool', 'cleaning', 'active']);

export function isActive(stateObj: HassEntity | undefined): boolean {
  if (!stateObj) return false;
  const domain = domainOf(stateObj.entity_id);
  if (domain === 'climate') return stateObj.state !== 'off' && stateObj.state !== 'unavailable';
  if (domain === 'lock') return stateObj.state === 'unlocked';
  return ON_STATES.has(stateObj.state);
}

export function isUnavailable(stateObj: HassEntity | undefined): boolean {
  return !stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown';
}

/** Toggle an entity using the service its domain supports. */
export function toggleEntity(hass: HomeAssistant, stateObj: HassEntity): Promise<unknown> {
  const domain = domainOf(stateObj.entity_id);
  const target = { entity_id: stateObj.entity_id };
  const on = isActive(stateObj);
  switch (domain) {
    case 'cover':
      return hass.callService('cover', on ? 'close_cover' : 'open_cover', {}, target);
    case 'lock':
      return hass.callService('lock', on ? 'lock' : 'unlock', {}, target);
    case 'scene':
    case 'script':
      return hass.callService(domain, 'turn_on', {}, target);
    case 'button':
    case 'input_button':
      return hass.callService(domain, 'press', {}, target);
    case 'media_player':
      return hass.callService('media_player', on ? 'turn_off' : 'turn_on', {}, target);
    case 'light':
    case 'switch':
    case 'fan':
    case 'input_boolean':
    case 'climate':
    case 'humidifier':
    case 'automation':
      return hass.callService(domain, on ? 'turn_off' : 'turn_on', {}, target);
    default:
      return hass.callService('homeassistant', 'toggle', {}, target);
  }
}

/** Last scan per domain: [states object it came from, its size, the ids]. */
const domainCache = new Map<string, { states: object; size: number; ids: string[] }>();

/**
 * Every entity id of a domain. HA hands out a new `states` object on each state
 * change, so scanning thousands of ids per card per update adds up: the list is
 * reused while the number of entities stays the same and its ids still exist.
 */
export function entityIdsOfDomain(hass: HomeAssistant | undefined, domain: string): string[] {
  const states = hass?.states;
  if (!states) return [];
  const hit = domainCache.get(domain);
  if (hit?.states === states) return hit.ids;
  let size = 0;
  for (const _ in states) size++;
  if (hit && hit.size === size && hit.ids.every((id) => id in states)) {
    hit.states = states;
    return hit.ids;
  }
  const prefix = `${domain}.`;
  const ids = Object.keys(states).filter((id) => id.startsWith(prefix));
  domainCache.set(domain, { states, size, ids });
  return ids;
}

export function friendlyName(stateObj: HassEntity | undefined, fallback = ''): string {
  return (stateObj?.attributes.friendly_name as string) ?? fallback;
}

/** Area name of an entity (its own area, else its device's), from HA's registries. */
export function areaName(hass: HomeAssistant | undefined, entityId: string): string | undefined {
  const entry = hass?.entities?.[entityId];
  if (!entry) return undefined;
  const areaId = entry.area_id ?? (entry.device_id ? hass?.devices?.[entry.device_id]?.area_id : undefined);
  return areaId ? hass?.areas?.[areaId]?.name : undefined;
}

/** "3分前", "2時間前"… for a timestamp. */
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

/** "19:05" in local time. */
export function hhmm(iso: string | number | Date | undefined): string {
  const d = iso instanceof Date ? iso : iso === undefined ? new Date(NaN) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Numeric state, or undefined when it isn't a number. */
export function numState(stateObj: HassEntity | undefined): number | undefined {
  if (!stateObj) return undefined;
  const n = Number(stateObj.state);
  return stateObj.state !== '' && Number.isFinite(n) ? n : undefined;
}

/** 0-255 brightness → 0-100 %. */
export const brightnessPct = (stateObj: HassEntity) =>
  stateObj.state === 'on' ? Math.round(((stateObj.attributes.brightness ?? 255) / 255) * 100) : 0;

/** Debounce that also lets the caller flush immediately. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const call = (...args: A) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  };
  call.flush = () => {
    if (t && lastArgs) {
      clearTimeout(t);
      t = undefined;
      fn(...lastArgs);
    }
  };
  call.pending = () => t !== undefined;
  return call;
}

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=Noto+Sans+JP:wght@400;500;700&display=swap';

/**
 * Inject the brand fonts into the document once (shadow roots inherit @font-face).
 *
 * The HA theme decides where they come from (`m3e-fonts`):
 *  - unset: Google Fonts
 *  - `none`: load nothing; the cards fall back to the system fonts (offline installs)
 *  - a URL such as `/local/fonts/m3e-fonts.css`: a self-hosted stylesheet
 * `window.M3E_CARDS_FONTS` (same values) wins over the theme.
 */
export function ensureFonts(): void {
  const id = 'material-3-expressive-card-fonts';
  if (document.getElementById(id)) return;
  const fromTheme = getComputedStyle(document.documentElement).getPropertyValue('--m3e-fonts').trim().replace(/^["']|["']$/g, '');
  const setting = String((window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS ?? fromTheme);
  if (setting === 'none') return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = setting || GOOGLE_FONTS;
  document.head.appendChild(link);
}
