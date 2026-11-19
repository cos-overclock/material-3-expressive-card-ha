export interface OptimisticOptions<T> {
  /** How long a guess stands before giving up. Default 30_000 ms. */
  ttlMs?: number;
  /** Called when the guess expires so the host can re-render. */
  onExpire?: () => void;
  /** Real states that override a pending guess immediately (e.g. 'error', 'unavailable'). */
  overriding?: readonly T[];
}

/**
 * Holds a requested state until Home Assistant reports the real state back.
 * Clears automatically when `actual` matches the guess, when an overriding
 * state arrives, or when the TTL expires.
 */
export class OptimisticState<T> {
  private guess?: T;
  private since = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly ttlMs: number;
  private readonly onExpire?: () => void;
  private readonly overriding: readonly T[];

  constructor(options: OptimisticOptions<T> = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.onExpire = options.onExpire;
    this.overriding = options.overriding ?? [];
  }

  set(value: T): void {
    this.guess = value;
    this.since = Date.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.guess = undefined;
      this.since = 0;
      this.timer = undefined;
      this.onExpire?.();
    }, this.ttlMs);
  }

  clear(): void {
    this.guess = undefined;
    this.since = 0;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  resolve(actual: T): { value: T; pending: boolean } {
    if (this.guess === undefined) return { value: actual, pending: false };
    if (actual === this.guess || this.overriding.includes(actual)) {
      this.clear();
      return { value: actual, pending: false };
    }
    return { value: this.guess, pending: true };
  }

  get pending(): boolean {
    return this.guess !== undefined;
  }

  get pendingSince(): number {
    return this.guess === undefined ? 0 : this.since;
  }
}
