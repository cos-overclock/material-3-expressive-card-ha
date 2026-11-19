import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * idle     nothing asked for yet
 * loading  a fetch is on its way
 * ok       the last fetch brought data
 * empty    the last fetch worked but brought nothing to show
 * error    the last fetch failed (the data of an earlier one may still be on screen)
 */
export type FetchStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error';

/** What a card shows about its data: the status, when it last arrived, and whether some is on screen. */
export interface FetchView {
  status: FetchStatus;
  /** When the data on screen was fetched (epoch ms). */
  updatedAt?: number;
  /** Data from an earlier fetch for the same key is still on screen. */
  hasData: boolean;
}

/**
 * Tracks the fetches of one kind of data on a card. `run()` drops answers
 * that a newer fetch has overtaken, records when data last arrived, and tells
 * an empty answer apart from a failure. The host re-renders on every change.
 *
 * The key names what the data belongs to (entity, window…). Callers clear
 * stale screen data when `shownKey !== key` before starting a new fetch.
 */
export class FetchTracker<T> implements ReactiveController {
  status: FetchStatus = 'idle';
  updatedAt?: number;
  error?: unknown;
  /** Key of the latest fetch. */
  key?: string;
  /** Key of the data on screen (the last successful fetch). */
  shownKey?: string;
  private shownStatus?: 'ok' | 'empty';
  private seq = 0;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly opts: {
      /** Whether an answer has nothing to show. Default: an empty array or object, null or undefined. */
      isEmpty?: (value: T) => boolean;
      /** Logged with a failure. */
      label?: string;
    } = {},
  ) {
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    // An answer arriving after the card left the page is dropped.
    this.seq++;
    if (this.status === 'loading') {
      if (this.shownKey && this.shownKey === this.key) {
        this.status = this.shownStatus ?? 'ok';
      } else {
        this.status = 'idle';
        // Let the next connect refetch instead of treating the aborted key as current.
        this.key = this.shownKey;
      }
    }
  }

  /** The state for <m3e-fetch-status>. */
  get view(): FetchView {
    return { status: this.status, updatedAt: this.updatedAt, hasData: !!this.shownKey && this.shownKey === this.key };
  }

  /** True while the latest fetch is `key`'s and still on its way. */
  isLoading(key?: string): boolean {
    return this.status === 'loading' && (key === undefined || key === this.key);
  }

  /**
   * Fetch `key` with `fetch` and hand the answer to `apply`, unless a newer
   * fetch has started meanwhile. Resolves true when `apply` ran.
   */
  async run(key: string, fetch: () => Promise<T>, apply: (value: T) => void): Promise<boolean> {
    const seq = ++this.seq;
    if (key !== this.key) {
      this.key = key;
      // The data on screen belongs to another key: it no longer counts.
      if (this.shownKey !== key) {
        this.shownKey = undefined;
        this.shownStatus = undefined;
        this.updatedAt = undefined;
      }
    }
    this.status = 'loading';
    this.error = undefined;
    this.host.requestUpdate();
    try {
      const value = await fetch();
      if (seq !== this.seq) return false;
      apply(value);
      this.shownKey = key;
      this.updatedAt = Date.now();
      const settled = (this.opts.isEmpty ?? isEmptyValue)(value) ? 'empty' : 'ok';
      this.shownStatus = settled;
      this.status = settled;
      return true;
    } catch (e) {
      if (seq !== this.seq) return false;
      console.warn(`${this.opts.label ?? 'material-3-expressive-card'}: fetch failed`, e);
      this.error = e;
      this.status = 'error';
      return false;
    } finally {
      if (seq === this.seq) this.host.requestUpdate();
    }
  }

  /** Forget everything (e.g. the card no longer fetches this data). */
  reset(): void {
    this.seq++;
    this.status = 'idle';
    this.updatedAt = undefined;
    this.error = undefined;
    this.key = undefined;
    this.shownKey = undefined;
    this.shownStatus = undefined;
    this.host.requestUpdate();
  }
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}
