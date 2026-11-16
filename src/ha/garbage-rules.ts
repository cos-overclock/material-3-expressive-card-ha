/** Garbage collection rules (Japanese municipal style), without the DOM so they can be tested. */
import type { Accent } from '../theme/tokens';

export type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export const DAYS: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface Rule {
  type: string;
  /** Weekdays: mon, tue… */
  days?: Day[];
  /** Only these weeks of the month (第1・第3 → [1, 3]). */
  weeks?: number[];
  /** One-off dates, YYYY-MM-DD. */
  dates?: string[];
  color?: Accent;
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether a rule collects on day `d`: a listed date, or its weekday in one of its weeks (第N = days 7N-6…7N). */
export function ruleHits(rule: Rule, d: Date): boolean {
  if (rule.dates?.includes(ymd(d))) return true;
  if (!rule.days?.includes(DAYS[d.getDay()])) return false;
  if (!rule.weeks?.length) return true;
  return rule.weeks.includes(Math.floor((d.getDate() - 1) / 7) + 1);
}
