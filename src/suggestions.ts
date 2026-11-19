import type { HomeAssistant, LovelaceCardConfig } from './ha/types';

/**
 * Card picker suggestions (HA 2026.6+). When an entity (or a device's entities)
 * is picked in "Add card", HA calls `getEntitySuggestion(hass, entityId)` on each
 * `window.customCards` entry and lists what it returns under "Community".
 * Return null when the card doesn't fit the entity; several variants need a label each.
 */
export interface CardSuggestion {
  config: LovelaceCardConfig;
  label?: string;
}

export type EntitySuggestion = (hass: HomeAssistant, entityId: string) => CardSuggestion | CardSuggestion[] | null;

const domainOf = (entityId: string) => entityId.split('.')[0];

function isNumeric(hass: HomeAssistant, entityId: string): boolean {
  const s = hass.states[entityId];
  if (!s) return false;
  const a = s.attributes;
  if (a.unit_of_measurement || a.state_class) return true;
  return s.state !== '' && Number.isFinite(Number(s.state));
}

/** One suggestion per layout, each labelled; a single layout comes back unlabelled. */
function variants(type: string, base: Record<string, unknown>, layouts: [string | undefined, string][]): CardSuggestion | CardSuggestion[] {
  const out = layouts.map(([layout, label]) => ({
    config: { type: `custom:${type}`, ...base, ...(layout ? { layout } : {}) },
    label,
  }));
  return out.length === 1 ? { config: out[0].config } : out;
}

const TILE_DOMAINS = new Set([
  'light',
  'switch',
  'fan',
  'input_boolean',
  'humidifier',
  'automation',
  'scene',
  'script',
  'button',
  'input_button',
]);

const LAUNDRY_RE = /washer|washing|laundry|sentaku|dryer|洗濯|乾燥機/i;

export const SUGGESTIONS: Record<string, EntitySuggestion> = {
  'm3e-tile-card': (_hass, id) =>
    TILE_DOMAINS.has(domainOf(id))
      ? variants('m3e-tile-card', { entity: id }, [
          ['tile', 'タイル（2行）'],
          ['row', 'タイル（1行）'],
          ['mini', 'タイル（ミニ）'],
        ])
      : null,

  // auto: 対応するカラーモードからスライダー／カラー／色温度を選ぶ
  'm3e-light-card': (_hass, id) => (domainOf(id) === 'light' ? { config: { type: 'custom:m3e-light-card', entity: id, layout: 'auto' } } : null),

  'm3e-climate-card': (_hass, id) => (domainOf(id) === 'climate' ? { config: { type: 'custom:m3e-climate-card', entity: id } } : null),

  'm3e-cover-card': (_hass, id) =>
    domainOf(id) === 'cover'
      ? variants('m3e-cover-card', { entity: id }, [
          [undefined, 'カーテン・シェード'],
          ['compact', 'カーテン・シェード（1行）'],
        ])
      : null,

  'm3e-media-card': (_hass, id) => (domainOf(id) === 'media_player' ? { config: { type: 'custom:m3e-media-card', entity: id } } : null),

  'm3e-lock-card': (_hass, id) =>
    domainOf(id) === 'lock'
      ? variants('m3e-lock-card', { entity: id }, [
          [undefined, '鍵'],
          ['compact', '鍵（1行）'],
        ])
      : null,

  'm3e-camera-card': (_hass, id) =>
    domainOf(id) === 'camera'
      ? variants('m3e-camera-card', { entity: id }, [
          [undefined, 'カメラ（ライブ映像）'],
          ['compact', 'カメラ（サムネイル）'],
        ])
      : null,

  'm3e-vacuum-card': (_hass, id) => (domainOf(id) === 'vacuum' ? { config: { type: 'custom:m3e-vacuum-card', entity: id } } : null),

  'm3e-water-heater-card': (_hass, id) =>
    domainOf(id) === 'water_heater' ? { config: { type: 'custom:m3e-water-heater-card', entity: id } } : null,

  'm3e-sensor-card': (hass, id) =>
    domainOf(id) === 'sensor' && isNumeric(hass, id)
      ? variants('m3e-sensor-card', { entity: id }, [
          [undefined, 'センサー（グラフつき）'],
          ['compact', 'センサー（小さい表示）'],
        ])
      : null,

  'm3e-value-card': (hass, id) => {
    const d = domainOf(id);
    const fits = d === 'binary_sensor' || ((d === 'sensor' || d === 'input_number' || d === 'number') && isNumeric(hass, id));
    return fits
      ? variants('m3e-value-card', { entity: id }, [
          ['tile', '値（2行）'],
          ['row', '値（1行）'],
          ['mini', '値（ミニ）'],
        ])
      : null;
  },

  'm3e-laundry-card': (hass, id) => {
    const d = domainOf(id);
    if (d !== 'sensor' && d !== 'select') return null;
    const name = String(hass.states[id]?.attributes.friendly_name ?? '');
    return LAUNDRY_RE.test(id) || LAUNDRY_RE.test(name) ? { config: { type: 'custom:m3e-laundry-card', entity: id } } : null;
  },

  'm3e-hero-card': (_hass, id) =>
    domainOf(id) === 'weather'
      ? variants('m3e-hero-card', { weather: id }, [
          [undefined, '時計と天気'],
          ['footer', '時計と天気（フッター）'],
        ])
      : null,

  'm3e-agenda-card': (_hass, id) => {
    const d = domainOf(id);
    if (d === 'calendar') return { config: { type: 'custom:m3e-agenda-card', calendars: [id] } };
    if (d === 'todo') return { config: { type: 'custom:m3e-agenda-card', todo: id } };
    return null;
  },

  'm3e-presence-card': (_hass, id) => (domainOf(id) === 'person' ? { config: { type: 'custom:m3e-presence-card', people: [id] } } : null),

  'm3e-fan-card': (_hass, id) => {
    const d = domainOf(id);
    return d === 'fan' || d === 'humidifier' ? { config: { type: 'custom:m3e-fan-card', entity: id } } : null;
  },

  'm3e-control-card': (_hass, id) =>
    ['select', 'input_select', 'number', 'input_number'].includes(domainOf(id))
      ? variants('m3e-control-card', { entity: id }, [
          [undefined, '選択・数値'],
          ['row', '選択・数値（1行）'],
        ])
      : null,

  'm3e-remote-card': (hass, id) => {
    const d = domainOf(id);
    if (d === 'remote') return { config: { type: 'custom:m3e-remote-card', remote_entity: id } };
    // A TV (device_class tv) as a media_player: offer the remote alongside the media card.
    if (d === 'media_player' && hass.states[id]?.attributes.device_class === 'tv') return { config: { type: 'custom:m3e-remote-card', entity: id } };
    return null;
  },

  'm3e-timer-card': (_hass, id) =>
    domainOf(id) === 'timer' ? { config: { type: 'custom:m3e-timer-card', entity: id, presets: ['3:00', '5:00', '10:00'] } } : null,

  'm3e-weather-card': (_hass, id) => (domainOf(id) === 'weather' ? { config: { type: 'custom:m3e-weather-card', entity: id } } : null),

  'm3e-alarm-card': (_hass, id) =>
    domainOf(id) === 'alarm_control_panel'
      ? [
          { config: { type: 'custom:m3e-alarm-card', entity: id }, label: '警備' },
          { config: { type: 'custom:m3e-alarm-card', entity: id, show_actions: true }, label: '警備（開始・解除ボタンつき）' },
        ]
      : null,

  'm3e-scenes-card': (_hass, id) => {
    const d = domainOf(id);
    return d === 'scene' || d === 'script' ? { config: { type: 'custom:m3e-scenes-card', scenes: [{ entity: id }] } } : null;
  },
};
