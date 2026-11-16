/**
 * Small live summaries over several entities, shared by the badges and the
 * section headings: "3つ点灯中", "2か所が開", "21.8 °C" (average)…
 */
import { formatSensor } from './format';
import { domainOf, isActive, numState } from './helpers';
import type { HomeAssistant } from './types';

export interface CountSummary {
  type: 'count';
  /** Entity ids, or omit and give `domain` to count every entity of a domain. */
  entities?: string[];
  domain?: string;
  /** States that count. Default: "active" (on, open, unlocked, playing…). */
  state?: string | string[];
  /** Text with {n} (matching), {rest} (not matching) and {total}; e.g. "{n}つ点灯中", "在宅 {n}人・外出 {rest}人". */
  text?: string;
  /** Text when nothing matches, e.g. "すべて消灯". */
  zero_text?: string;
}

export interface AverageSummary {
  type: 'average';
  entities: string[];
  /** Decimals. Default 1. */
  decimals?: number;
  unit?: string;
}

/** Today's date: "11月13日（金）". */
export interface DateSummary {
  type: 'date';
  entities?: undefined;
}

export type Summary = CountSummary | AverageSummary | DateSummary;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function jaDate(d: Date, withYear = false): string {
  return `${withYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

export function summaryEntities(hass: HomeAssistant | undefined, s: Summary): string[] {
  if (s.entities) return s.entities;
  if (s.type === 'count' && s.domain && hass) return Object.keys(hass.states).filter((id) => domainOf(id) === s.domain);
  return [];
}

export function summaryText(hass: HomeAssistant | undefined, s: Summary): string {
  if (s.type === 'date') return jaDate(new Date());
  const ids = summaryEntities(hass, s);
  if (s.type === 'average') {
    const vals = ids.map((id) => numState(hass?.states[id])).filter((v): v is number => v !== undefined);
    if (!vals.length) return '—';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const unit = s.unit ?? (hass?.states[ids[0]]?.attributes.unit_of_measurement as string | undefined) ?? '';
    const v = avg.toFixed(s.decimals ?? 1);
    // Same as formatSensor: "21.8°", "48%", "620 ppm".
    if (unit === '°C' || unit === '°F') return `${v}°`;
    if (unit === '%') return `${v}%`;
    return `${v}${unit ? ` ${unit}` : ''}`;
  }
  const states = s.state === undefined ? undefined : [s.state].flat();
  const n = ids.filter((id) => {
    const st = hass?.states[id];
    if (!st) return false;
    return states ? states.includes(st.state) : isActive(st);
  }).length;
  if (n === 0 && s.zero_text) return s.zero_text;
  return (s.text ?? '{n}')
    .replace('{n}', String(n))
    .replace('{rest}', String(ids.length - n))
    .replace('{total}', String(ids.length));
}

export { formatSensor };
