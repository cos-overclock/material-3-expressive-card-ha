// @vitest-environment happy-dom
import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { M3eBaseCard, type BaseCardConfig } from '../src/cards/base-card';
import { nextBoundaryDelay, VisibleTicker } from '../src/ha/visible-ticker';
import { ent, mockHass } from './helpers/dom';

const realIO = globalThis.IntersectionObserver;
(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

class MockIO {
  static instances: MockIO[] = [];
  readonly cb: IntersectionObserverCallback;
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  trigger(isIntersecting: boolean) {
    const entries = [...this.observed].map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry);
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

class M3eTestTickerCard extends M3eBaseCard<BaseCardConfig> {
  visLog: boolean[] = [];
  protected watchedEntities(): string[] {
    return [];
  }
  protected normalizeConfig(c: BaseCardConfig): BaseCardConfig {
    return c;
  }
  protected override clockInterval(): number {
    return 1000;
  }
  protected override visibilityChanged(visible: boolean): void {
    this.visLog.push(visible);
  }
  protected renderCard() {
    return html`<div class="now">${this.clockNow}</div>`;
  }
}

if (!customElements.get('m3e-test-ticker-card')) {
  customElements.define('m3e-test-ticker-card', M3eTestTickerCard);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  MockIO.instances = [];
  globalThis.IntersectionObserver = realIO;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.body.innerHTML = '';
});

describe('VisibleTicker', () => {
  it('aligns boundary delays to exact periods with 20ms safety margin', () => {
    expect(nextBoundaryDelay(1000, 5000)).toBe(1020);
    expect(nextBoundaryDelay(1000, 5250)).toBe(770);
    expect(nextBoundaryDelay(60_000, 120_000)).toBe(60_020);
    expect(nextBoundaryDelay(60_000, 135_000)).toBe(45_020);
    expect(nextBoundaryDelay(0, 1000)).toBe(0);
  });

  it('pauses when scrolled offscreen or tab-hidden, resumes immediately on return, and cleans up', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.200Z'));
    globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;

    const host = document.createElement('div');
    document.body.appendChild(host);
    const ticks: number[] = [];
    const vis: boolean[] = [];
    const ticker = new VisibleTicker(host, {
      onTick: (now) => ticks.push(now),
      onVisibility: (v) => vis.push(v),
      initialVisible: true,
    });

    ticker.connect(1000);
    expect(ticks.length).toBe(1);
    expect(vis).toEqual([]);
    expect(ticker.running).toBe(true);

    // Next boundary is at +820ms (1000 - 200 + 20).
    vi.advanceTimersByTime(819);
    expect(ticks.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(ticks.length).toBe(2);

    // Scroll offscreen -> stops immediately and fires visibility false.
    const io = MockIO.instances[0];
    io.trigger(false);
    expect(ticker.visible).toBe(false);
    expect(ticker.running).toBe(false);
    expect(vis).toEqual([false]);
    vi.advanceTimersByTime(5000);
    expect(ticks.length).toBe(2);

    // Scroll back into view -> ticks at once and resumes.
    io.trigger(true);
    expect(ticker.visible).toBe(true);
    expect(ticker.running).toBe(true);
    expect(vis).toEqual([false, true]);
    expect(ticks.length).toBe(3);

    // Tab hidden pauses, tab visible resumes.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ticker.running).toBe(false);
    expect(vis).toEqual([false, true, false]);
    vi.advanceTimersByTime(5000);
    expect(ticks.length).toBe(3);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ticker.running).toBe(true);
    expect(ticks.length).toBe(4);
    expect(vis).toEqual([false, true, false, true]);

    ticker.disconnect();
    expect(ticker.running).toBe(false);
    expect(io.disconnected).toBe(true);
  });

  it('integrates with M3eBaseCard without spurious initial visibilityChanged(true)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
    globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;

    const hass = mockHass([ent('light.a', 'on')]);
    const card = document.createElement('m3e-test-ticker-card') as M3eTestTickerCard;
    card.setConfig({ type: 'custom:m3e-test-ticker-card' });
    card.hass = hass;
    document.body.appendChild(card);
    await card.updateComplete;
    expect(card.visLog).toEqual([]);

    const io = MockIO.instances.at(-1)!;
    io.trigger(false);
    expect(card.visLog).toEqual([false]);

    const before = card.shadowRoot!.querySelector('.now')!.textContent;
    await vi.advanceTimersByTimeAsync(3500);
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.now')!.textContent).toBe(before);

    io.trigger(true);
    await card.updateComplete;
    expect(card.visLog).toEqual([false, true]);
    expect(card.shadowRoot!.querySelector('.now')!.textContent).not.toBe(before);
  });
});
