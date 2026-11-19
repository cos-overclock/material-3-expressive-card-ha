import { describe, expect, it } from 'vitest';
import { ACCENTS, LATTE_ACCENTS, LATTE_SURFACES, MOCHA_ACCENTS, MOCHA_SURFACES } from '../src/theme/tokens';
import { accentFromRgb } from '../src/theme/dynamic';
import { kelvinToRgb } from '../src/ha/color';

type RGB = [number, number, number];

function parseColor(color: string): RGB {
  const s = color.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!m) throw new Error(`Unsupported colour format: ${color}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function relativeLuminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('WCAG 2.1 contrast audit', () => {
  it('all 14 Catppuccin Latte accents meet role contrast targets', () => {
    for (const accent of ACCENTS) {
      const [fill, onFill, container, onContainer, shape, onShape] = LATTE_ACCENTS[accent];
      // White glyphs/labels on filled controls and shapes reach >= 3:1 (UI / large-text target).
      expect(contrastRatio(fill, onFill), `latte ${accent} fill/onFill`).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(shape, onShape), `latte ${accent} shape/onShape`).toBeGreaterThanOrEqual(3.0);
      // Body text inside active containers reaches WCAG AA 4.5:1.
      expect(contrastRatio(container, onContainer), `latte ${accent} container/onContainer`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('all 14 Catppuccin Mocha accents meet role contrast targets', () => {
    for (const accent of ACCENTS) {
      const [fill, onFill, container, onContainer, shape, onShape] = MOCHA_ACCENTS[accent];
      expect(contrastRatio(fill, onFill), `mocha ${accent} fill/onFill`).toBeGreaterThanOrEqual(7.0);
      expect(contrastRatio(container, onContainer), `mocha ${accent} container/onContainer`).toBeGreaterThanOrEqual(7.0);
      expect(contrastRatio(shape, onShape), `mocha ${accent} shape/onShape`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(fill, MOCHA_SURFACES.surfaceContainer), `mocha ${accent} fill/surfaceContainer`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('neutral surfaces (Latte & Mocha) meet text contrast targets', () => {
    for (const [name, s, varContainerMin, varHighMin] of [
      ['latte', LATTE_SURFACES, 4.0, 3.5],
      ['mocha', MOCHA_SURFACES, 4.5, 4.5],
    ] as const) {
      expect(contrastRatio(s.onSurface, s.bg), `${name} onSurface/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSurface, s.surfaceContainer), `${name} onSurface/surfaceContainer`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSurface, s.surfaceHigh), `${name} onSurface/surfaceHigh`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.inverseOnSurface, s.inverseSurface), `${name} inverse`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSurfaceVariant, s.bg), `${name} onSurfaceVariant/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSurfaceVariant, s.surfaceContainer), `${name} onSurfaceVariant/surfaceContainer`).toBeGreaterThanOrEqual(
        varContainerMin,
      );
      expect(contrastRatio(s.onSurfaceVariant, s.surfaceHigh), `${name} onSurfaceVariant/surfaceHigh`).toBeGreaterThanOrEqual(varHighMin);
    }
  });

  it('OKLCH dynamic accents (RGB cube + Kelvin sweep) keep legibility in Latte and Mocha', () => {
    const steps = [0, 64, 128, 192, 255];
    const samples: RGB[] = [];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) samples.push([r, g, b]);
      }
    }
    for (let k = 1800; k <= 7000; k += 200) samples.push(kelvinToRgb(k));

    for (const rgb of samples) {
      const latte = accentFromRgb(rgb, 'latte');
      expect(contrastRatio(latte['--accent-fill'], latte['--accent-on-fill']), `latte rgb(${rgb}) fill`).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(latte['--accent-shape'], latte['--accent-on-shape']), `latte rgb(${rgb}) shape`).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(latte['--accent-container'], latte['--accent-on-container']), `latte rgb(${rgb}) container`).toBeGreaterThanOrEqual(4.5);

      const mocha = accentFromRgb(rgb, 'mocha');
      expect(contrastRatio(mocha['--accent-fill'], mocha['--accent-on-fill']), `mocha rgb(${rgb}) fill`).toBeGreaterThanOrEqual(7.0);
      expect(contrastRatio(mocha['--accent-container'], mocha['--accent-on-container']), `mocha rgb(${rgb}) container`).toBeGreaterThanOrEqual(7.0);
      expect(contrastRatio(mocha['--accent-shape'], mocha['--accent-on-shape']), `mocha rgb(${rgb}) shape`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
