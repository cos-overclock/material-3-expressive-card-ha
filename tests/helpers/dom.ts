/**
 * Helpers for the card tests (happy-dom): a minimal hass whose calls are
 * vi.fn()s, mounting a card, waiting for it to settle, and querying its
 * shadow DOM.
 */
import { vi } from 'vitest';
import type { HassEntity, HomeAssistant } from '../../src/ha/types';

export const ent = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: '2026-11-16T00:00:00Z',
  last_updated: '2026-11-16T00:00:00Z',
});

export type MockHass = HomeAssistant & {
  callService: ReturnType<typeof vi.fn>;
  callWS: ReturnType<typeof vi.fn>;
  callApi: ReturnType<typeof vi.fn>;
};

/** A hass with these entities; callService / callWS / callApi resolve to undefined unless replaced. */
export function mockHass(entities: HassEntity[], extra: Partial<HomeAssistant> = {}): MockHass {
  return {
    states: Object.fromEntries(entities.map((e) => [e.entity_id, e])),
    themes: { darkMode: false },
    callService: vi.fn().mockResolvedValue(undefined),
    callWS: vi.fn().mockResolvedValue(undefined),
    callApi: vi.fn().mockResolvedValue(undefined),
    ...extra,
  } as unknown as MockHass;
}

/** The same hass with one entity's state changed (a new object, as HA hands out). */
export function withState(hass: MockHass, e: HassEntity): MockHass {
  return { ...hass, states: { ...hass.states, [e.entity_id]: e } };
}

type Card = HTMLElement & { setConfig(c: Record<string, unknown>): void; hass?: HomeAssistant; updateComplete: Promise<boolean> };

/** Create a card, configure it, give it hass and put it on the page. */
export async function mount<T extends Card = Card>(tag: string, config: Record<string, unknown>, hass: HomeAssistant): Promise<T> {
  const el = document.createElement(tag) as T;
  el.setConfig({ type: `custom:${tag}`, ...config });
  el.hass = hass;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** Let pending promises, timers of 0ms and Lit updates run until the card is quiet. */
export async function settle(el?: { updateComplete: Promise<boolean> }): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (el) await el.updateComplete;
  }
}

/** A promise with its resolve / reject handles, to answer a fetch when the test says so. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** querySelector through nested shadow roots: `$(card, 'm3e-fetch-status', '.retry')`. */
export function $(root: Element, ...selectors: string[]): HTMLElement | null {
  let node: Element | null = root;
  for (const sel of selectors) {
    const scope: ParentNode | null | undefined = node?.shadowRoot ?? node;
    node = scope?.querySelector(sel) ?? null;
    if (!node) return null;
  }
  return node as HTMLElement;
}

export function $$(root: Element, selector: string): HTMLElement[] {
  return [...(root.shadowRoot ?? root).querySelectorAll<HTMLElement>(selector)];
}

/** Text of an element and its shadow tree, whitespace collapsed. */
export function text(el: Element | null): string {
  if (!el) return '';
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
    const sr = (n as Element).shadowRoot;
    if (sr) sr.childNodes.forEach(walk);
    n.childNodes.forEach(walk);
  };
  walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export function key(el: Element, k: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }));
}

/** Silence the console.warn a failing fetch logs, for the duration of a test. */
export function quietWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}
