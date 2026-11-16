/**
 * Accent roles generated from an arbitrary colour (a light's current colour),
 * tuned to sit beside the Catppuccin accents: in Latte the colour is pulled
 * into a mid-dark range so white glyphs and text on the card stay legible; in
 * Mocha it becomes a pastel with dark glyphs, like the Mocha accents.
 *
 * Works in OKLCH so lightness changes keep the hue, and maps back into sRGB by
 * reducing chroma until the colour fits.
 */

type RGB = [number, number, number];
type Theme = 'latte' | 'mocha';

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]: RGB): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function oklchToLinear(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB, lowering chroma until it is inside the gamut. */
function oklchToRgb(L: number, C: number, H: number): RGB {
  let c = C;
  for (let i = 0; i < 24; i++) {
    const lin = oklchToLinear(L, c, H);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as RGB;
    c *= 0.88;
  }
  return oklchToLinear(L, 0, H).map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as RGB;
}

const css = ([r, g, b]: RGB) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const SURFACE: Record<Theme, RGB> = { latte: [230, 233, 239], mocha: [30, 30, 46] }; // surface-container
const BASE: Record<Theme, RGB> = { latte: [239, 241, 245], mocha: [30, 30, 46] };
const DARK_ON: RGB = [17, 17, 27];

/** --accent-* custom properties for a colour in the given theme. */
export function accentFromRgb(rgb: RGB, theme: Theme): Record<string, string> {
  const [L, C, H] = rgbToOklch(rgb);
  if (theme === 'latte') {
    const fill = oklchToRgb(clamp(L, 0.5, 0.62), Math.min(C, 0.2), H);
    const onContainer = oklchToRgb(0.42, Math.min(C, 0.12), H);
    return {
      '--accent-fill': css(fill),
      '--accent-on-fill': '#FFFFFF',
      '--accent-container': css(mix(BASE.latte, fill, 0.22)),
      '--accent-on-container': css(onContainer),
      '--accent-shape': css(fill),
      '--accent-on-shape': '#FFFFFF',
      '--accent-track': css(mix(SURFACE.latte, fill, 0.32)),
    };
  }
  const fill = oklchToRgb(clamp(L, 0.8, 0.88), Math.min(C, 0.12), H);
  return {
    '--accent-fill': css(fill),
    '--accent-on-fill': css(DARK_ON),
    '--accent-container': css(fill),
    '--accent-on-container': css(DARK_ON),
    '--accent-shape': css(mix(BASE.mocha, fill, 0.1)),
    '--accent-on-shape': css(fill),
    '--accent-track': css(mix(SURFACE.mocha, fill, 0.38)),
  };
}
