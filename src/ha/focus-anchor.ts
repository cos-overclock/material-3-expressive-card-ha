/** How long the last pointerdown target remains eligible as an anchor before falling back to the card. */
export const POINTER_MEMORY_MS = 2000;

/** Active element across open shadow roots. */
export function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** Whether `node` sits inside `host`, traversing shadow root host boundaries. */
export function isInside(host: Node, node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current === host) return true;
    current = current.parentNode ?? (current as ShadowRoot).host ?? null;
  }
  return false;
}

/**
 * Parks focus on `target` before HA opens a dialog so closing it returns focus
 * here instead of scrolling back to an unrelated previously focused control.
 * If keyboard focus is already inside `target`, leave it on that control.
 */
export function anchorFocus(target: HTMLElement): void {
  const doc = target.ownerDocument ?? document;
  const active = deepActiveElement(doc);
  if (active && active !== doc.body && isInside(target, active)) return;
  if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

let lastPointer: { el: HTMLElement; at: number } | undefined;

/** Records the innermost element a pointer went down on for `anchorTarget()`. */
export function rememberPointer(el: HTMLElement | undefined, now = Date.now()): void {
  lastPointer = el ? { el, at: now } : undefined;
}

/**
 * The best anchor inside `card` for `hass-more-info`: the tapped element if
 * still connected inside `card` and recent, else `card` itself.
 */
export function anchorTarget(card: HTMLElement, now = Date.now()): HTMLElement {
  const remembered = lastPointer;
  if (!remembered) return card;
  if (now - remembered.at > POINTER_MEMORY_MS) return card;
  if (!remembered.el.isConnected || !isInside(card, remembered.el)) return card;
  return remembered.el;
}

const INSTALLED = Symbol.for('m3e-cards.focus-anchor');

/**
 * Installs window-level capture listeners once so every `hass-more-info`
 * coming from an `m3e-*` card anchors focus without scrolling.
 */
export function installFocusAnchor(win: Window = window): void {
  if (!win) return;
  const flagged = win as unknown as Record<symbol, boolean>;
  if (flagged[INSTALLED]) return;
  flagged[INSTALLED] = true;
  win.addEventListener(
    'pointerdown',
    (event) => {
      const el = event.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement);
      rememberPointer(el);
    },
    { capture: true, passive: true },
  );
  win.addEventListener(
    'hass-more-info',
    (event) => {
      const card = event.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName.startsWith('M3E-'));
      if (card) anchorFocus(anchorTarget(card));
    },
    { capture: true },
  );
}
