/**
 * Energy settings and long-term statistics for the preview. Today's totals
 * (up to the current hour) match the design: solar 9.8 kWh, battery charge
 * 3.0 / discharge 2.6, grid import 1.9 / export 2.7, home 8.6 kWh.
 */

type Profile = (h: number) => number;
const bell =
  (mu: number, sigma: number): Profile =>
  (h) =>
    Math.exp(-((h + 0.5 - mu) ** 2) / (2 * sigma * sigma));
const plus =
  (...ps: Profile[]): Profile =>
  (h) =>
    ps.reduce((a, p) => a + p(h), 0);
const between =
  (a: number, b: number, p: Profile): Profile =>
  (h) =>
    h >= a && h < b ? p(h) : 0;
const flat: Profile = () => 1;

/** [statistic id, today's kWh, hourly profile] */
export const ENERGY_STATS: [string, number, Profile][] = [
  ['sensor.solar_energy', 9.8, between(6, 18, bell(12.5, 2.8))],
  ['sensor.grid_import_energy', 1.9, plus(between(0, 7, flat), bell(19.5, 1.5))],
  ['sensor.grid_export_energy', 2.7, between(9, 16, bell(12.5, 1.8))],
  ['sensor.battery_charge_energy', 3.0, between(8, 16, bell(11.5, 2))],
  ['sensor.battery_discharge_energy', 2.6, plus(between(0, 7, () => 0.4), between(17, 24, bell(19.5, 1.6)))],
  ['sensor.ac_energy', 2.1, plus(bell(7.5, 1.2), bell(19.5, 2))],
  ['sensor.tv_energy', 0.7, bell(20.5, 1.5)],
  ['sensor.living_light_energy', 0.6, between(16, 24, flat)],
  ['sensor.fridge_energy', 1.0, flat],
  ['sensor.dishwasher_energy', 0.8, bell(20.5, 0.6)],
  ['sensor.coffee_energy', 0.3, bell(7.5, 0.5)],
  ['sensor.water_heater_energy', 1.2, plus(bell(7.5, 0.8), bell(19.5, 1))],
  ['sensor.humidifier_energy', 0.5, plus(between(0, 7, flat), between(21, 24, flat))],
  ['sensor.bedroom_light_energy', 0.4, between(18, 24, flat)],
];

export const ENERGY_DEVICES: [string, string][] = [
  ['sensor.ac_energy', 'エアコン'],
  ['sensor.tv_energy', 'テレビ'],
  ['sensor.living_light_energy', '照明'],
  ['sensor.fridge_energy', '冷蔵庫'],
  ['sensor.dishwasher_energy', '食洗機'],
  ['sensor.coffee_energy', 'コーヒー'],
  ['sensor.water_heater_energy', '給湯器'],
  ['sensor.humidifier_energy', '加湿器'],
  ['sensor.bedroom_light_energy', '照明'],
];

export const ENERGY_AREAS: Record<string, string> = {
  'sensor.ac_energy': 'living',
  'sensor.tv_energy': 'living',
  'sensor.living_light_energy': 'living',
  'sensor.fridge_energy': 'kitchen',
  'sensor.dishwasher_energy': 'kitchen',
  'sensor.coffee_energy': 'kitchen',
  'sensor.water_heater_energy': 'bath',
  'sensor.humidifier_energy': 'bedroom',
  'sensor.bedroom_light_energy': 'bedroom',
};

export const ENERGY_PREFS = {
  energy_sources: [
    {
      type: 'grid',
      flow_from: [{ stat_energy_from: 'sensor.grid_import_energy' }],
      flow_to: [{ stat_energy_to: 'sensor.grid_export_energy' }],
    },
    { type: 'solar', stat_energy_from: 'sensor.solar_energy' },
    { type: 'battery', stat_energy_from: 'sensor.battery_discharge_energy', stat_energy_to: 'sensor.battery_charge_energy' },
  ],
  device_consumption: ENERGY_DEVICES.map(([stat_consumption, name]) => ({ stat_consumption, name })),
};

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Day-to-day variation; yesterday used a little more than today. */
function dayFactor(day: number, today: number): number {
  const n = Math.round((today - day) / 86400_000);
  if (n === 1) return 1.12;
  return 1 + 0.18 * Math.sin(n * 1.7);
}

export function mockStatistics(msg: Record<string, unknown>): Record<string, { start: number; end: number; change: number }[]> {
  const start = Date.parse(String(msg.start_time));
  const end = Date.parse(String(msg.end_time));
  const period = String(msg.period);
  const now = Date.now();
  const today = startOfDay(now);
  const nowHour = new Date(now).getHours();
  const out: Record<string, { start: number; end: number; change: number }[]> = {};
  for (const id of msg.statistic_ids as string[]) {
    const stat = ENERGY_STATS.find(([s]) => s === id);
    if (!stat) continue;
    const [, total, profile] = stat;
    const w = Array.from({ length: 24 }, (_, h) => profile(h));
    const wToday = w.slice(0, nowHour + 1).reduce((a, b) => a + b, 0) || 1;
    const wAll = w.reduce((a, b) => a + b, 0) || 1;
    const rows: { start: number; end: number; change: number }[] = [];
    if (period === 'hour') {
      for (let t = start; t < end && t <= now; t += 3600_000) {
        const day = startOfDay(t);
        const h = new Date(t).getHours();
        // Normalised to the hours so far, so "today vs yesterday until now" compares like for like.
        const change = ((day === today ? total : total * dayFactor(day, today)) * w[h]) / (day === today || dayFactor(day, today) === 1.12 ? wToday : wAll);
        rows.push({ start: t, end: t + 3600_000, change });
      }
    } else {
      for (let t = startOfDay(start); t < end && t <= now; t += 86400_000) {
        rows.push({ start: t, end: t + 86400_000, change: t === today ? total : total * dayFactor(t, today) });
      }
    }
    out[id] = rows;
  }
  return out;
}
