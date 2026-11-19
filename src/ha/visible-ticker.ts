/**
 * Delay in ms until the next `periodMs` boundary, plus a small `marginMs`
 * buffer so the callback never lands just before the second/minute turns.
 */
export function nextBoundaryDelay(periodMs: number, now = Date.now(), marginMs = 20): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0;
  return periodMs - (now % periodMs) + marginMs;
}

export interface VisibleTickerOptions {
  onTick: (now: number) => void;
  onVisibility?: (visible: boolean) => void;
  initialVisible?: boolean;
}

/**
 * Boundary-aligned periodic timer that pauses automatically whenever its host
 * is scrolled offscreen (`IntersectionObserver`), the tab is hidden
 * (`visibilitychange`), or the host is disconnected.
 */
export class VisibleTicker {
  private connected = false;
  private onScreen = true;
  private tabVisible = true;
  private periodMs = 0;
  private timeoutId?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private lastVisible: boolean;

  private readonly onDocVisibility = () => {
    this.tabVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    this.sync();
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: VisibleTickerOptions,
  ) {
    this.lastVisible = opts.initialVisible ?? true;
  }

  get visible(): boolean {
    return this.connected && this.onScreen && this.tabVisible;
  }

  get running(): boolean {
    return this.timeoutId !== undefined;
  }

  connect(periodMs: number): void {
    this.connected = true;
    this.onScreen = true;
    this.tabVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    document.addEventListener('visibilitychange', this.onDocVisibility);
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.length) return;
          this.onScreen = entries.some((e) => e.isIntersecting);
          this.sync();
        },
        { threshold: 0 },
      );
      this.observer.observe(this.host);
    }
    this.setPeriod(periodMs);
    this.sync();
  }

  disconnect(): void {
    document.removeEventListener('visibilitychange', this.onDocVisibility);
    this.observer?.disconnect();
    this.observer = undefined;
    this.connected = false;
    this.sync();
  }

  setPeriod(periodMs: number): void {
    const next = periodMs > 0 && Number.isFinite(periodMs) ? periodMs : 0;
    if (next === this.periodMs && (next > 0) === (this.visible && this.running)) return;
    this.periodMs = next;
    this.stopTimer();
    if (this.visible && next > 0) {
      this.opts.onTick(Date.now());
      this.schedule();
    }
  }

  private sync(): void {
    const vis = this.visible;
    if (vis && this.periodMs > 0 && !this.running) {
      this.opts.onTick(Date.now());
      this.schedule();
    } else if (!vis && this.running) {
      this.stopTimer();
    }
    if (vis !== this.lastVisible) {
      this.lastVisible = vis;
      this.opts.onVisibility?.(vis);
    }
  }

  private schedule(): void {
    this.stopTimer();
    if (!this.visible || this.periodMs <= 0) return;
    const delay = nextBoundaryDelay(this.periodMs);
    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined;
      if (!this.visible || this.periodMs <= 0) return;
      this.opts.onTick(Date.now());
      this.schedule();
    }, delay);
  }

  private stopTimer(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
