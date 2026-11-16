/** Durations for the timer card: "h:mm:ss" strings, seconds and Japanese labels. */

/** "1:02:03" / "2:03" / 5 (minutes) → seconds. */
export function parseDuration(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v * 60;
  const parts = v.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Seconds → "4:05" or "1:02:03". */
export function formatDuration(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Seconds → "h:mm:ss" for timer.start / timer.change. */
export const hms = (sec: number) => {
  const t = Math.round(sec);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** A preset's label: 180 → "3分", 90 → "1分30秒", 3600 → "1時間". */
export function presetLabel(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h ? `${h}時間` : '', m ? `${m}分` : '', s ? `${s}秒` : ''].join('') || '0秒';
}
