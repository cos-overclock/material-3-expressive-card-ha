import type { HassEntity, HomeAssistant } from './types';

/** The decimals set for an entity in HA ("表示精度"), if any. */
export function displayPrecision(s: HassEntity, hass?: HomeAssistant): number | undefined {
  const p = hass?.entities?.[s.entity_id]?.display_precision ?? s.attributes.display_precision;
  return typeof p === 'number' && p >= 0 ? p : undefined;
}

/**
 * Short sensor reading: "21.8°", "45%", "620 ppm". Honours the entity's
 * display precision; °F and K keep their unit ("70.2°F") so they aren't read as °C.
 */
export function formatSensor(s: HassEntity | undefined, hass?: HomeAssistant): string {
  if (!s || s.state === 'unavailable' || s.state === 'unknown') return '—';
  const dc = s.attributes.device_class;
  const n = Number(s.state);
  const unit = s.attributes.unit_of_measurement as string | undefined;
  const prec = displayPrecision(s, hass);
  const fixed = (fallback: number) => n.toFixed(prec ?? fallback);
  if (dc === 'temperature' && Number.isFinite(n)) {
    if (unit === '°F') return `${fixed(1)}°F`;
    if (unit === 'K') return `${fixed(1)} K`;
    return `${fixed(1)}°`;
  }
  if (dc === 'humidity' && Number.isFinite(n)) return `${fixed(0)}%`;
  if (!Number.isFinite(n) || s.state.trim() === '') return unit ? `${s.state} ${unit}` : s.state;
  // One format across the cards: 1240.0 W → 1.24 kW, 184.0 L → 184 L.
  if (unit === 'W' && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(prec ?? 2)} kW`;
  const v = prec !== undefined ? n.toFixed(prec) : String(+n.toFixed(2));
  return unit ? `${v} ${unit}` : v;
}
