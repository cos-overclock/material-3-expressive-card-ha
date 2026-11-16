/**
 * M3 Expressive shapes, built the way the FigCraft design builds them: a star
 * or polygon whose every vertex is rounded with a circular fillet.
 *
 * Every shape here is star-convex around its centre, so we describe it as a
 * radius per angle, sampled at SAMPLES evenly spaced angles. Two shapes then
 * morph by interpolating radii, and any pair of shapes morphs cleanly.
 */

export type ShapeDef =
  | { kind: 'circle' }
  | { kind: 'star'; points: number; inner: number; corner: number }
  | { kind: 'polygon'; sides: number; corner: number }
  | { kind: 'rect'; corner: number };

/** Corner radii are relative to the shape's size (FigCraft px ÷ layer size). */
export const SHAPES = {
  circle: { kind: 'circle' },
  /** 9-point cookie: tile and card icons (44px, inner 0.82, r 9). */
  cookie9: { kind: 'star', points: 9, inner: 0.82, corner: 9 / 44 },
  /** 12-point cookie: weather (64px, inner 0.86, r 8). */
  cookie12: { kind: 'star', points: 12, inner: 0.86, corner: 8 / 64 },
  /** 8-point burst: energy, security (64px, inner 0.78, r 10). */
  burst8: { kind: 'star', points: 8, inner: 0.78, corner: 10 / 64 },
  /** 4-point sparkle: media artwork (52px, inner 0.35, r 6). */
  sparkle4: { kind: 'star', points: 4, inner: 0.35, corner: 6 / 52 },
  /** 4-leaf clover (80px, inner 0.72, r 20). */
  clover4: { kind: 'star', points: 4, inner: 0.72, corner: 20 / 80 },
  /** Rounded pentagon (80px, r 18). */
  pentagon: { kind: 'polygon', sides: 5, corner: 18 / 80 },
  /** Rounded square, 1/4 corner. */
  square: { kind: 'rect', corner: 0.25 },
} as const satisfies Record<string, ShapeDef>;

export type ShapeName = keyof typeof SHAPES;

export const SAMPLES = 144;

/** Rotational symmetry period in degrees (used for rotation kicks). */
export function shapePeriod(def: ShapeDef): number {
  switch (def.kind) {
    case 'circle':
      return 0;
    case 'star':
      return 360 / def.points;
    case 'polygon':
      return 360 / def.sides;
    case 'rect':
      return 90;
  }
}

type Pt = [number, number];

function vertices(def: ShapeDef): Pt[] {
  const R = 0.5;
  const at = (a: number, r: number): Pt => [Math.cos(a) * r, Math.sin(a) * r];
  const top = -Math.PI / 2;
  switch (def.kind) {
    case 'star': {
      const out: Pt[] = [];
      for (let i = 0; i < def.points * 2; i++) {
        out.push(at(top + (i * Math.PI) / def.points, i % 2 ? R * def.inner : R));
      }
      return out;
    }
    case 'polygon': {
      const out: Pt[] = [];
      for (let i = 0; i < def.sides; i++) out.push(at(top + (i * 2 * Math.PI) / def.sides, R));
      return out;
    }
    case 'rect':
      return [
        [-R, -R],
        [R, -R],
        [R, R],
        [-R, R],
      ];
    case 'circle':
      return [];
  }
}

/** Dense outline of a polygon with every vertex filleted by radius `corner`. */
function roundedOutline(verts: Pt[], corner: number): Pt[] {
  const out: Pt[] = [];
  const n = verts.length;
  const corners: { s: Pt; e: Pt; arc: Pt[] }[] = [];
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    const p = verts[(i - 1 + n) % n];
    const q = verts[(i + 1) % n];
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]);
    const lq = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const u1: Pt = [(p[0] - v[0]) / lp, (p[1] - v[1]) / lp];
    const u2: Pt = [(q[0] - v[0]) / lq, (q[1] - v[1]) / lq];
    const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const half = theta / 2;
    let t = corner / Math.tan(half);
    t = Math.min(t, lp / 2, lq / 2);
    const r = t * Math.tan(half);
    const s: Pt = [v[0] + u1[0] * t, v[1] + u1[1] * t];
    const e: Pt = [v[0] + u2[0] * t, v[1] + u2[1] * t];
    const bl = Math.hypot(u1[0] + u2[0], u1[1] + u2[1]) || 1;
    const b: Pt = [(u1[0] + u2[0]) / bl, (u1[1] + u2[1]) / bl];
    const d = r / Math.sin(half);
    const c: Pt = [v[0] + b[0] * d, v[1] + b[1] * d];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    const a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = 10;
    const arc: Pt[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      arc.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
    corners.push({ s, e, arc });
  }
  for (let i = 0; i < n; i++) {
    const cur = corners[i];
    const next = corners[(i + 1) % n];
    out.push(...cur.arc);
    // Subdivide the straight edge so polar resampling stays accurate.
    const segs = 12;
    for (let k = 1; k < segs; k++) {
      const f = k / segs;
      out.push([cur.e[0] + (next.s[0] - cur.e[0]) * f, cur.e[1] + (next.s[1] - cur.e[1]) * f]);
    }
  }
  return out;
}

const radiiCache = new Map<string, Float32Array>();

/** Radius at SAMPLES angles (starting at the top, clockwise), for a unit-size shape. */
export function shapeRadii(name: ShapeName): Float32Array {
  const hit = radiiCache.get(name);
  if (hit) return hit;
  const def: ShapeDef = SHAPES[name];
  const radii = new Float32Array(SAMPLES);
  if (def.kind === 'circle') {
    radii.fill(0.5);
  } else {
    const outline = roundedOutline(vertices(def), def.corner);
    const polar = outline
      .map(([x, y]) => {
        let a = Math.atan2(y, x) + Math.PI / 2; // 0 at top
        a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return [a, Math.hypot(x, y)] as Pt;
      })
      .sort((p, q) => p[0] - q[0]);
    const first = polar[0];
    const last = polar[polar.length - 1];
    const ring: Pt[] = [[last[0] - 2 * Math.PI, last[1]], ...polar, [first[0] + 2 * Math.PI, first[1]]];
    let j = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const a = (i / SAMPLES) * 2 * Math.PI;
      while (j < ring.length - 2 && ring[j + 1][0] < a) j++;
      const [a0, r0] = ring[j];
      const [a1, r1] = ring[j + 1];
      const f = a1 === a0 ? 0 : (a - a0) / (a1 - a0);
      radii[i] = r0 + (r1 - r0) * f;
    }
  }
  radiiCache.set(name, radii);
  return radii;
}

/** Interpolated radii between two shapes; `t` may overshoot past 0..1 (springs). */
export function morphRadii(from: Float32Array, to: Float32Array, t: number, out = new Float32Array(SAMPLES)): Float32Array {
  for (let i = 0; i < SAMPLES; i++) out[i] = from[i] + (to[i] - from[i]) * t;
  return out;
}

/**
 * SVG path for radii in a box of `size`, smoothed with a closed Catmull-Rom
 * spline. Angles start at the top and run clockwise.
 */
export function radiiToPath(radii: Float32Array, size: number): string {
  const n = radii.length;
  const c = size / 2;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    xs[i] = c + Math.cos(a) * radii[i] * size;
    ys[i] = c + Math.sin(a) * radii[i] * size;
  }
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M${f(xs[0])} ${f(ys[0])}`;
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    const c1x = xs[i] + (xs[i2] - xs[i0]) / 6;
    const c1y = ys[i] + (ys[i2] - ys[i0]) / 6;
    const c2x = xs[i2] - (xs[i3] - xs[i]) / 6;
    const c2y = ys[i2] - (ys[i3] - ys[i]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(xs[i2])} ${f(ys[i2])}`;
  }
  return `${d}Z`;
}

export function isShapeName(v: unknown): v is ShapeName {
  return typeof v === 'string' && v in SHAPES;
}
