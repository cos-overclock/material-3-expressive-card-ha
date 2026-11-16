import type { HassEntity } from './types';

/** Short sensor reading: "21.8°", "45%", "620 ppm". */
export function formatSensor(s: HassEntity | undefined): string {
  if (!s || s.state === 'unavailable' || s.state === 'unknown') return '—';
  const dc = s.attributes.device_class;
  const n = Number(s.state);
  if (dc === 'temperature' && Number.isFinite(n)) return `${n.toFixed(1)}°`;
  if (dc === 'humidity' && Number.isFinite(n)) return `${Math.round(n)}%`;
  const unit = s.attributes.unit_of_measurement as string | undefined;
  if (!Number.isFinite(n) || s.state.trim() === '') return unit ? `${s.state} ${unit}` : s.state;
  // One format across the cards: 1240.0 W → 1.24 kW, 184.0 L → 184 L.
  if (unit === 'W' && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} kW`;
  const v = String(+n.toFixed(2));
  return unit ? `${v} ${unit}` : v;
}
