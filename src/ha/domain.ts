import type { Accent } from '../theme/tokens';
import { brightnessPct, domainOf, isActive } from './helpers';
import type { HassEntity } from './types';

/** Default accent per domain, matching the design (lights warm, covers lavender…). */
export function defaultAccentFor(entityId: string): Accent {
  switch (domainOf(entityId)) {
    case 'light':
      return 'yellow';
    case 'cover':
      return 'lavender';
    case 'fan':
    case 'humidifier':
      return 'sky';
    case 'climate':
      return 'peach';
    case 'media_player':
      return 'mauve';
    case 'lock':
    case 'alarm_control_panel':
      return 'green';
    case 'vacuum':
    case 'valve':
      return 'teal';
    default:
      return 'blue';
  }
}

/** Default icon (bundled glyph key) per domain and state. */
export function defaultIconFor(stateObj: HassEntity | undefined, entityId: string): string {
  const on = isActive(stateObj);
  const dc = stateObj?.attributes.device_class as string | undefined;
  switch (domainOf(entityId)) {
    case 'light':
      return 'lightbulb';
    case 'switch':
      return dc === 'outlet' ? 'electric-bolt' : 'power-settings-new';
    case 'fan':
      return 'mode-fan';
    case 'cover':
      if (dc === 'curtain') return on ? 'curtains' : 'curtains-closed';
      if (dc === 'blind') return 'blinds';
      if (dc === 'garage') return 'garage-door';
      return on ? 'roller-shades' : 'roller-shades-closed';
    case 'lock':
      return on ? 'lock-open-right' : 'lock';
    case 'humidifier':
      return 'humidity-percentage';
    case 'climate':
      return 'thermostat';
    case 'media_player':
      return dc === 'tv' ? 'tv' : 'speaker';
    case 'vacuum':
      return 'robot-vacuum';
    case 'binary_sensor':
      if (dc === 'door') return 'door-front';
      if (dc === 'window') return 'window';
      if (dc === 'motion' || dc === 'occupancy') return 'motion-sensor-active';
      return 'sensors';
    case 'scene':
      return 'wb-twilight';
    default:
      return 'power-settings-new';
  }
}

/** Short Japanese state line, e.g. "オン・40%", "開・100%", "オフ". */
export function stateText(stateObj: HassEntity | undefined): string {
  if (!stateObj) return '見つかりません';
  const s = stateObj.state;
  const a = stateObj.attributes;
  if (s === 'unavailable') return '利用不可';
  if (s === 'unknown') return '不明';
  switch (domainOf(stateObj.entity_id)) {
    case 'light':
      return s === 'on' ? `オン・${brightnessPct(stateObj)}%` : 'オフ';
    case 'fan':
      return s === 'on' ? (a.percentage != null ? `オン・${a.percentage}%` : 'オン') : 'オフ';
    case 'cover': {
      const pos = a.current_position;
      if (s === 'opening') return '開いています';
      if (s === 'closing') return '閉じています';
      if (s === 'open') return pos != null ? `開・${pos}%` : '開';
      return '閉';
    }
    case 'humidifier':
      return s === 'on' ? (a.humidity != null ? `オン・目標 ${a.humidity}%` : 'オン') : 'オフ';
    case 'lock':
      return s === 'locked' ? '施錠中' : s === 'unlocked' ? '解錠中' : s;
    default:
      if (s === 'on') return 'オン';
      if (s === 'off') return 'オフ';
      return s;
  }
}
