/** Movement before a touch counts as a horizontal drag or a vertical page scroll. */
export const SLIDER_INTENT_SLOP_PX = 8;

/** Stop an event from bubbling to ancestor swipe-navigation plugins (e.g. hass-swipe-navigation). */
export function stopSwipe(e: Event): void {
  e.stopPropagation();
}

/** `setPointerCapture` guarded for synthetic events or taps whose pointer already lifted. */
export function capturePointer(el: Element | null | undefined, pointerId: number): void {
  try {
    el?.setPointerCapture?.(pointerId);
  } catch {
    /* pointer may not be active in synthetic events or after release */
  }
}

/** `releasePointerCapture` guarded when capture was never acquired or already released. */
export function releasePointer(el: Element | null | undefined, pointerId: number): void {
  try {
    if (el?.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    /* already released */
  }
}

/**
 * Shield an interactive control from ancestor swipe-navigation plugins across
 * the whole touch/mouse gesture without calling `preventDefault()`, keeping
 * native vertical scrolling (`touch-action: pan-y`) intact.
 */
export function attachSwipeShield(el: EventTarget, active: () => boolean = () => true): () => void {
  const stop = (e: Event) => {
    if (active()) stopSwipe(e);
  };
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('touchmove', stop, { passive: true });
  el.addEventListener('touchend', stop, { passive: true });
  el.addEventListener('mousedown', stop);
  el.addEventListener('mousemove', stop);
  el.addEventListener('mouseup', stop);
  return () => {
    el.removeEventListener('touchstart', stop);
    el.removeEventListener('touchmove', stop);
    el.removeEventListener('touchend', stop);
    el.removeEventListener('mousedown', stop);
    el.removeEventListener('mousemove', stop);
    el.removeEventListener('mouseup', stop);
  };
}

type IntentPhase = 'idle' | 'pending' | 'drag' | 'scroll';

/**
 * Disambiguates horizontal slider drags from vertical page scrolls on touch
 * screens: a touch stays `pending` until movement exceeds `slop` px, then
 * commits to either `'drag'` (horizontal) or `'scroll'` (vertical). A touch
 * released before moving becomes `'tap'` on pointerup. Mouse / pen start in
 * `'drag'` immediately.
 */
export class SliderIntent {
  private phase: IntentPhase = 'idle';
  private startX = 0;
  private startY = 0;
  private pointerId = -1;

  constructor(private readonly slop = SLIDER_INTENT_SLOP_PX) {}

  get dragging(): boolean {
    return this.phase === 'drag';
  }

  get pending(): boolean {
    return this.phase === 'pending';
  }

  /** Returns true when dragging begins immediately (mouse, pen, or non-touch). */
  down(e: PointerEvent): boolean {
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.phase = e.pointerType === 'touch' ? 'pending' : 'drag';
    return this.phase === 'drag';
  }

  /**
   * `'start'` once when a pending touch proves horizontal, `'drag'` for
   * subsequent moves, `'none'` while still undecided or claimed by scrolling.
   */
  move(e: PointerEvent): 'start' | 'drag' | 'none' {
    if (e.pointerId !== this.pointerId) return 'none';
    if (this.phase === 'drag') return 'drag';
    if (this.phase !== 'pending') return 'none';
    const dx = Math.abs(e.clientX - this.startX);
    const dy = Math.abs(e.clientY - this.startY);
    if (Math.max(dx, dy) < this.slop) return 'none';
    this.phase = dx > dy ? 'drag' : 'scroll';
    return this.phase === 'drag' ? 'start' : 'none';
  }

  /** `'tap'` for a touch that lifted without dragging, `'drag'` to finish a drag, else `'none'`. */
  up(e: PointerEvent): 'tap' | 'drag' | 'none' {
    if (e.pointerId !== this.pointerId) return 'none';
    const prev = this.phase;
    this.reset();
    return prev === 'pending' ? 'tap' : prev === 'drag' ? 'drag' : 'none';
  }

  /** Returns true only if an active drag was interrupted (never for pending scroll). */
  cancel(e: PointerEvent): boolean {
    if (e.pointerId !== this.pointerId) return false;
    const wasDragging = this.phase === 'drag';
    this.reset();
    return wasDragging;
  }

  reset(): void {
    this.phase = 'idle';
    this.pointerId = -1;
  }
}
