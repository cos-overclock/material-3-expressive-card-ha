import { css, unsafeCSS } from 'lit';

/**
 * Colour tokens from the FigCraft variables (collection "Theme", modes
 * Latte (Light) / Mocha (Dark)). Each accent has seven roles:
 *   fill / on-fill            strong filled controls (selected, +)
 *   container / on-container  active tile background and its text
 *   shape / on-shape          the icon shape and its glyph, switch track
 *   track                     slider inactive track, unselected presets
 */
export const ACCENTS = [
  'rosewater',
  'flamingo',
  'pink',
  'mauve',
  'red',
  'maroon',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'sapphire',
  'blue',
  'lavender',
] as const;
export type Accent = (typeof ACCENTS)[number];

/** Display names, in Catppuccin's palette order. */
export const ACCENT_LABELS: Record<Accent, string> = {
  rosewater: 'Rosewater',
  flamingo: 'Flamingo',
  pink: 'Pink',
  mauve: 'Mauve',
  red: 'Red',
  maroon: 'Maroon',
  peach: 'Peach',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  sky: 'Sky',
  sapphire: 'Sapphire',
  blue: 'Blue',
  lavender: 'Lavender',
};

/** `select` selector options for a colour field in a config form. */
export const ACCENT_OPTIONS = ACCENTS.map((value) => ({ value, label: ACCENT_LABELS[value] }));

/*
 * rosewater, flamingo, maroon and sapphire were added after the FigCraft
 * variables and follow the same derivation as the other ten:
 *   Latte  fill        the Catppuccin colour, darkened (OKLCH L) until white text reaches 3:1
 *          container   24% of the colour over #EFF1F5, track 41%
 *          on-container 60% of the fill over #11111B
 *   Mocha  shape       16% of the colour over #11111B, track 78%
 */
type Roles = [fill: string, onFill: string, container: string, onContainer: string, shape: string, onShape: string, track: string];

export const LATTE_ACCENTS: Record<Accent, Roles> = {
  rosewater: ['#CF7E6D', '#FFFFFF', '#EAD8D7', '#83524C', '#CF7E6D', '#FFFFFF', '#E7C7C2'],
  flamingo: ['#DB7676', '#FFFFFF', '#EBD4D7', '#8A4E52', '#DB7676', '#FFFFFF', '#E8BFC2'],
  maroon: ['#E64553', '#FFFFFF', '#EDC8CE', '#91303D', '#E64553', '#FFFFFF', '#EBAAB3'],
  sapphire: ['#209FB5', '#FFFFFF', '#BDDDE6', '#1A6677', '#209FB5', '#FFFFFF', '#9ACFDB'],
  mauve: ['#8839EF', '#FFFFFF', '#D6C5F4', '#58299A', '#8839EF', '#FFFFFF', '#C5A6F3'],
  yellow: ['#CA8528', '#FFFFFF', '#EBD9C1', '#84571C', '#CA8528', '#FFFFFF', '#E4C79F'],
  peach: ['#FA640D', '#FFFFFF', '#F3CFBD', '#9A4112', '#FA640D', '#FFFFFF', '#F5B796'],
  green: ['#40A02B', '#FFFFFF', '#C5DEC5', '#2D6725', '#40A02B', '#FFFFFF', '#A8D0A3'],
  sky: ['#0A9EDB', '#FFFFFF', '#B7DFF1', '#0A648C', '#0A9EDB', '#FFFFFF', '#91D1EC'],
  blue: ['#1E66F5', '#FFFFFF', '#BDD0F5', '#19449E', '#1E66F5', '#FFFFFF', '#9AB9F5'],
  red: ['#D20F39', '#FFFFFF', '#E8BBC8', '#85102D', '#D20F39', '#FFFFFF', '#E395A9'],
  teal: ['#179299', '#FFFFFF', '#BBDADF', '#155E67', '#179299', '#FFFFFF', '#97CAD0'],
  lavender: ['#7287FD', '#FFFFFF', '#D1D8F7', '#4B58A3', '#7287FD', '#FFFFFF', '#BCC6F8'],
  pink: ['#D471BD', '#FFFFFF', '#EED3EB', '#86487A', '#D471BD', '#FFFFFF', '#E8BDE1'],
};

export const MOCHA_ACCENTS: Record<Accent, Roles> = {
  rosewater: ['#F5E0DC', '#11111B', '#F5E0DC', '#11111B', '#35323A', '#F5E0DC', '#C3B2B2'],
  flamingo: ['#F2CDCD', '#11111B', '#F2CDCD', '#11111B', '#352F37', '#F2CDCD', '#C1A4A6'],
  maroon: ['#EBA0AC', '#11111B', '#EBA0AC', '#11111B', '#342832', '#EBA0AC', '#BB818C'],
  sapphire: ['#74C7EC', '#11111B', '#74C7EC', '#11111B', '#212E3C', '#74C7EC', '#5E9FBE'],
  mauve: ['#CBA6F7', '#11111B', '#CBA6F7', '#11111B', '#2F293E', '#CBA6F7', '#A285C7'],
  yellow: ['#F9E2AF', '#11111B', '#F9E2AF', '#11111B', '#363233', '#F9E2AF', '#C6B48E'],
  peach: ['#FAB387', '#11111B', '#FAB387', '#11111B', '#362B2C', '#FAB387', '#C78F6F'],
  green: ['#A6E3A1', '#11111B', '#A6E3A1', '#11111B', '#293330', '#A6E3A1', '#85B584'],
  sky: ['#89DCEB', '#11111B', '#89DCEB', '#11111B', '#24313C', '#89DCEB', '#6FAFBD'],
  blue: ['#89B4FA', '#11111B', '#89B4FA', '#11111B', '#242B3F', '#89B4FA', '#6F90C9'],
  red: ['#F38BA8', '#11111B', '#F38BA8', '#11111B', '#352532', '#F38BA8', '#C17089'],
  teal: ['#94E2D5', '#11111B', '#94E2D5', '#11111B', '#263239', '#94E2D5', '#77B4AC'],
  lavender: ['#B4BEFE', '#11111B', '#B4BEFE', '#11111B', '#2B2D3F', '#B4BEFE', '#9098CC'],
  pink: ['#F5C2E7', '#11111B', '#F5C2E7', '#11111B', '#352D3C', '#F5C2E7', '#C39BBA'],
};

const ROLE_NAMES = ['', 'on-', '-container', 'on-|-container', '-shape', 'on-|-shape', '-track'];

function accentVars(table: Record<Accent, Roles>): string {
  return ACCENTS.map((a) =>
    table[a]
      .map((value, i) => {
        const role = ROLE_NAMES[i];
        const [pre, post] = role.includes('|') ? role.split('|') : role.startsWith('on-') ? ['on-', ''] : ['', role];
        return `--acc-${pre}${a}${post}: ${value};`;
      })
      .join(' '),
  ).join('\n');
}

export const LATTE_SURFACES = {
  bg: '#FAFAFA',
  surfaceContainer: '#E6E9EF',
  surfaceHigh: '#DCE0E8',
  surfaceHighest: '#CCD0DA',
  surfaceBright: '#EFF1F5',
  onSurface: '#4C4F69',
  onSurfaceVariant: '#6C6F85',
  outline: '#9CA0B0',
  outlineVariant: '#BCC0CC',
  inverseSurface: '#4C4F69',
  inverseOnSurface: '#EFF1F5',
} as const;

export const MOCHA_SURFACES = {
  bg: '#11111B',
  surfaceContainer: '#1E1E2E',
  surfaceHigh: '#313244',
  surfaceHighest: '#45475A',
  surfaceBright: '#585B70',
  onSurface: '#CDD6F4',
  onSurfaceVariant: '#A6ADC8',
  outline: '#6C7086',
  outlineVariant: '#45475A',
  inverseSurface: '#CDD6F4',
  inverseOnSurface: '#1E1E2E',
} as const;

const LATTE = `
  --m3e-bg: ${LATTE_SURFACES.bg};
  --m3-surface-container: ${LATTE_SURFACES.surfaceContainer};
  --m3-surface-high: ${LATTE_SURFACES.surfaceHigh};
  --m3-surface-highest: ${LATTE_SURFACES.surfaceHighest};
  --m3-surface-bright: ${LATTE_SURFACES.surfaceBright};
  --m3-on-surface: ${LATTE_SURFACES.onSurface};
  --m3-on-surface-variant: ${LATTE_SURFACES.onSurfaceVariant};
  --m3-outline: ${LATTE_SURFACES.outline};
  --m3-outline-variant: ${LATTE_SURFACES.outlineVariant};
  --m3-inverse-surface: ${LATTE_SURFACES.inverseSurface};
  --m3-inverse-on-surface: ${LATTE_SURFACES.inverseOnSurface};
  --m3e-swatch-border: rgba(0, 0, 0, 0.1);
  ${accentVars(LATTE_ACCENTS)}
`;

const MOCHA = `
  --m3e-bg: ${MOCHA_SURFACES.bg};
  --m3-surface-container: ${MOCHA_SURFACES.surfaceContainer};
  --m3-surface-high: ${MOCHA_SURFACES.surfaceHigh};
  --m3-surface-highest: ${MOCHA_SURFACES.surfaceHighest};
  --m3-surface-bright: ${MOCHA_SURFACES.surfaceBright};
  --m3-on-surface: ${MOCHA_SURFACES.onSurface};
  --m3-on-surface-variant: ${MOCHA_SURFACES.onSurfaceVariant};
  --m3-outline: ${MOCHA_SURFACES.outline};
  --m3-outline-variant: ${MOCHA_SURFACES.outlineVariant};
  --m3-inverse-surface: ${MOCHA_SURFACES.inverseSurface};
  --m3-inverse-on-surface: ${MOCHA_SURFACES.inverseOnSurface};
  --m3e-swatch-border: rgba(255, 255, 255, 0.12);
  ${accentVars(MOCHA_ACCENTS)}
`;

/** `--accent-*` resolved from `--acc-<name>-*` for an element with data-accent. */
function accentSelectors(): string {
  return ACCENTS.map(
    (a) => `[data-accent='${a}'], :host([data-accent='${a}']) {
      --accent-fill: var(--acc-${a});
      --accent-on-fill: var(--acc-on-${a});
      --accent-container: var(--acc-${a}-container);
      --accent-on-container: var(--acc-on-${a}-container);
      --accent-shape: var(--acc-${a}-shape);
      --accent-on-shape: var(--acc-on-${a}-shape);
      --accent-track: var(--acc-${a}-track);
    }`,
  ).join('\n');
}

/**
 * Palette for a card's shadow root. The host carries `theme="latte|mocha"`
 * (set from the HA dark-mode flag unless the card config forces one).
 */
export const themeTokens = css`
  :host {
    ${unsafeCSS(LATTE)}
    --m3e-font-brand: 'Google Sans Flex', 'Google Sans', 'Noto Sans JP', system-ui, sans-serif;
    --m3e-font-plain: 'Noto Sans JP', 'Google Sans Flex', system-ui, sans-serif;
    --accent-fill: var(--acc-blue);
    --accent-on-fill: var(--acc-on-blue);
    --accent-container: var(--acc-blue-container);
    --accent-on-container: var(--acc-on-blue-container);
    --accent-shape: var(--acc-blue-shape);
    --accent-on-shape: var(--acc-on-blue-shape);
    --accent-track: var(--acc-blue-track);
  }
  :host([theme='mocha']) {
    ${unsafeCSS(MOCHA)}
  }
  ${unsafeCSS(accentSelectors())}
  /* Off / idle: the same roles mapped onto the neutral surfaces. */
  [data-accent='neutral'],
  :host([data-accent='neutral']) {
    --accent-fill: var(--m3-on-surface-variant);
    --accent-on-fill: var(--m3-surface-container);
    --accent-container: var(--m3-surface-high);
    --accent-on-container: var(--m3-on-surface);
    --accent-shape: var(--m3-surface-highest);
    --accent-on-shape: var(--m3-on-surface-variant);
    --accent-track: var(--m3-surface-highest);
  }
`;

export const PAGE_BACKGROUND = { latte: '#FAFAFA', mocha: '#11111B' } as const;
