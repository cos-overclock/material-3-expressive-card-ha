/**
 * Material 3 Expressive motion: springs.
 *
 * M3 Expressive specifies motion as springs (stiffness + damping ratio) rather
 * than duration + cubic-bezier. Two families exist:
 *  - spatial: position, size, shape, rotation. Expressive values overshoot.
 *  - effects: colour, opacity. Critically damped, never overshoot.
 *
 * We use springs two ways:
 *  1. `springTransition()` turns a spring into a CSS `linear()` easing plus a
 *     settle duration, so plain CSS transitions follow the same physics.
 *  2. `SpringValue` integrates a spring per frame in JS. It keeps velocity when
 *     the target changes mid-flight (drag release, rapid taps), which CSS
 *     transitions cannot do.
 */

export interface SpringSpec {
  /** Stiffness k for unit mass. */
  stiffness: number;
  /** Damping ratio ζ: < 1 overshoots, 1 is critical. */
  damping: number;
}

/** M3 Expressive motion scheme tokens (androidx.compose.material3 MotionScheme.expressive). */
export const SPRINGS = {
  spatialFast: { stiffness: 800, damping: 0.6 },
  spatialDefault: { stiffness: 380, damping: 0.8 },
  spatialSlow: { stiffness: 200, damping: 0.8 },
  effectsFast: { stiffness: 3800, damping: 1 },
  effectsDefault: { stiffness: 1600, damping: 1 },
  effectsSlow: { stiffness: 800, damping: 1 },
} as const satisfies Record<string, SpringSpec>;

export type SpringToken = keyof typeof SPRINGS;

/** Closed-form position of a unit step response (0 → 1) at time t seconds. */
export function springStep(spec: SpringSpec, t: number): number {
  const w0 = Math.sqrt(spec.stiffness);
  const z = spec.damping;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  if (z === 1) {
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  const s = w0 * Math.sqrt(z * z - 1);
  const r1 = -z * w0 + s;
  const r2 = -z * w0 - s;
  // x(0) = 0 and x'(0) = 0 give c1 + c2 = 1 and c1·r1 + c2·r2 = 0.
  const c1 = r2 / (r2 - r1);
  const c2 = r1 / (r1 - r2);
  return 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
}

/** Time (s) after which the step response stays within `epsilon` of 1. */
export function settleTime(spec: SpringSpec, epsilon = 0.001): number {
  const dt = 1 / 240;
  let lastOutside = 0;
  for (let t = 0; t < 5; t += dt) {
    if (Math.abs(1 - springStep(spec, t)) > epsilon) lastOutside = t;
  }
  return lastOutside + dt;
}

export interface CssSpring {
  duration: number; // ms
  easing: string; // linear(...)
  /** "<duration>ms <easing>" for the transition shorthand. */
  timing: string;
}

const cssCache = new Map<string, CssSpring>();

/** A CSS transition timing equivalent to the spring. */
export function springTransition(spec: SpringSpec): CssSpring {
  const key = `${spec.stiffness}/${spec.damping}`;
  const hit = cssCache.get(key);
  if (hit) return hit;
  const total = settleTime(spec);
  const samples = Math.min(80, Math.max(16, Math.round(total * 90)));
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : springStep(spec, (total * i) / samples);
    pts.push(String(Math.round(v * 10000) / 10000));
  }
  const duration = Math.round(total * 1000);
  const easing = `linear(${pts.join(', ')})`;
  const out = { duration, easing, timing: `${duration}ms ${easing}` };
  cssCache.set(key, out);
  return out;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A value driven by a spring, integrated per animation frame. Changing the
 * target keeps the current velocity, so interrupted motion stays continuous.
 */
export class SpringValue {
  value: number;
  velocity = 0;
  target: number;
  private raf = 0;
  private last = 0;

  constructor(
    initial: number,
    public spec: SpringSpec,
    private readonly onUpdate: (value: number) => void,
    private readonly onRest?: (value: number) => void,
  ) {
    this.value = initial;
    this.target = initial;
  }

  /** Animate towards `target`. */
  set(target: number, spec?: SpringSpec): void {
    if (spec) this.spec = spec;
    this.target = target;
    if (prefersReducedMotion()) {
      this.jump(target);
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** Move instantly, cancelling any motion. */
  jump(value: number): void {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  /** Add velocity (units/second), e.g. a flick or a rotation kick. */
  impulse(velocity: number): void {
    this.velocity += velocity;
    this.set(this.target);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get animating(): boolean {
    return this.raf !== 0;
  }

  private tick = (now: number): void => {
    let dt = Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    const k = this.spec.stiffness;
    const c = 2 * this.spec.damping * Math.sqrt(k);
    // Semi-implicit Euler in fixed sub-steps for stability at high stiffness.
    const step = 1 / 600;
    while (dt > 0) {
      const h = Math.min(step, dt);
      const force = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    const scale = Math.max(1, Math.abs(this.target));
    if (Math.abs(this.value - this.target) < 0.0005 * scale && Math.abs(this.velocity) < 0.01 * scale) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.onUpdate(this.value);
      this.onRest?.(this.value);
      return;
    }
    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}
