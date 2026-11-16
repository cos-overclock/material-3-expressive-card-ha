/** Colour helpers for light presets. */

export function hexToHs(hex: string): [number, number] {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  return [Math.round(h), Math.round(s)];
}

export function hsToCss(h: number, s: number): string {
  // HA hs_color is HSV with V = 100%.
  const v = 1;
  const sat = s / 100;
  const l = v * (1 - sat / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${h} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** HA hs_color (HSV with V = 100%) → sRGB 0-255. */
export function hsToRgb(h: number, s: number): [number, number, number] {
  const sat = s / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

/**
 * UI colour for a colour temperature, read off the design's temperature
 * gradient (2000K #FF9E4A → #FFC98A → #FFF1DE → #F4F4F6 → 6500K #C7DBFF), so a
 * cool white tints the card blue instead of a flat grey, and the tint matches
 * the slider under the handle.
 */
export const TEMP_STOPS: [number, string][] = [
  [0, '#FF9E4A'],
  [0.2, '#FFC98A'],
  [0.5, '#FFF1DE'],
  [0.72, '#F4F4F6'],
  [1, '#C7DBFF'],
];

export function kelvinToUiRgb(k: number, min = 2000, max = 6500): [number, number, number] {
  const t = Math.min(1, Math.max(0, (k - min) / (max - min)));
  let i = 0;
  while (i < TEMP_STOPS.length - 2 && t > TEMP_STOPS[i + 1][0]) i++;
  const [t0, c0] = TEMP_STOPS[i];
  const [t1, c1] = TEMP_STOPS[i + 1];
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const a = hexRgb(c0);
  const b = hexRgb(c1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Approximate sRGB colour of a black-body temperature. */
export function kelvinToRgb(k: number): [number, number, number] {
  const m = kelvinToCss(k).match(/\d+/g)!.map(Number);
  return [m[0], m[1], m[2]];
}

/** Approximate sRGB colour of a black-body temperature (for swatches). */
export function kelvinToCss(k: number): string {
  const t = k / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${c(r)} ${c(g)} ${c(b)})`;
}
