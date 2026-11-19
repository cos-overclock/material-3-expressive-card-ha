// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SliderIntent } from '../../src/components/gesture';
import '../../src/components/m3e-slider';
import '../../src/components/m3e-wavy-progress';
import '../../src/components/m3e-line-chart';
import type { M3eSlider } from '../../src/components/m3e-slider';
import type { M3eWavyProgress } from '../../src/components/m3e-wavy-progress';
import type { M3eLineChart } from '../../src/components/m3e-line-chart';
import { $ } from '../helpers/dom';

const rect200 = (): DOMRect =>
  ({ left: 0, top: 0, width: 200, height: 44, right: 200, bottom: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

function ptr(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 1, ...init });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SliderIntent state machine', () => {
  it('starts immediately for mouse, waits 8px slop for touch, and disambiguates scroll vs drag', () => {
    const mouse = new SliderIntent();
    expect(mouse.down(ptr('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 10 }))).toBe(true);
    expect(mouse.dragging).toBe(true);
    expect(mouse.up(ptr('pointerup', { pointerType: 'mouse' }))).toBe('drag');

    // Vertical touch scroll (> 8px Y before X) ignores drag and never cancels as a drag.
    const scroll = new SliderIntent();
    expect(scroll.down(ptr('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 50, clientY: 20 }))).toBe(false);
    expect(scroll.pending).toBe(true);
    expect(scroll.move(ptr('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 52, clientY: 25 }))).toBe('none');
    expect(scroll.move(ptr('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 52, clientY: 32 }))).toBe('none');
    expect(scroll.dragging).toBe(false);
    expect(scroll.pending).toBe(false);
    expect(scroll.cancel(ptr('pointercancel', { pointerType: 'touch', pointerId: 2 }))).toBe(false);

    // Horizontal touch drag (> 8px X) emits start once, then drag, and isolates other pointerIds.
    const drag = new SliderIntent();
    drag.down(ptr('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 50, clientY: 20 }));
    expect(drag.move(ptr('pointermove', { pointerType: 'touch', pointerId: 99, clientX: 120, clientY: 20 }))).toBe('none');
    expect(drag.move(ptr('pointermove', { pointerType: 'touch', pointerId: 3, clientX: 60, clientY: 22 }))).toBe('start');
    expect(drag.move(ptr('pointermove', { pointerType: 'touch', pointerId: 3, clientX: 80, clientY: 22 }))).toBe('drag');
    expect(drag.up(ptr('pointerup', { pointerType: 'touch', pointerId: 3 }))).toBe('drag');

    // Touch that never moves becomes a tap on up, and cancel during pending returns false.
    const tap = new SliderIntent();
    tap.down(ptr('pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 50, clientY: 20 }));
    expect(tap.up(ptr('pointerup', { pointerType: 'touch', pointerId: 4 }))).toBe('tap');

    const pendingCancel = new SliderIntent();
    pendingCancel.down(ptr('pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 50, clientY: 20 }));
    expect(pendingCancel.cancel(ptr('pointercancel', { pointerType: 'touch', pointerId: 5 }))).toBe(false);
  });
});

describe('m3e-slider touch scroll & swipe protection', () => {
  async function makeSlider() {
    const el = document.createElement('m3e-slider') as M3eSlider;
    el.min = 0;
    el.max = 100;
    el.step = 1;
    el.value = 50;
    document.body.appendChild(el);
    await el.updateComplete;
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(rect200);
    const inputs: number[] = [];
    const changes: number[] = [];
    el.addEventListener('input', (e) => inputs.push((e as CustomEvent<{ value: number }>).detail.value));
    el.addEventListener('change', (e) => changes.push((e as CustomEvent<{ value: number }>).detail.value));
    return { el, inputs, changes };
  }

  it('ignores vertical touch scroll without changing value or emitting events', async () => {
    const { el, inputs, changes } = await makeSlider();
    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 160, clientY: 20 }));
    el.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 161, clientY: 34 }));
    el.dispatchEvent(ptr('pointercancel', { pointerType: 'touch', clientX: 161, clientY: 40 }));
    expect(el.value).toBe(50);
    expect(inputs).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('commits horizontal touch drag and tap, and shields ancestor swipe plugins', async () => {
    const { el, inputs, changes } = await makeSlider();
    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 20 }));
    el.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 140, clientY: 22 }));
    el.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 160, clientY: 22 }));
    el.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 160, clientY: 22 }));
    expect(inputs.length).toBe(2);
    expect(changes).toEqual([inputs[1]]);
    expect(el.value).toBeGreaterThan(70);

    // Pure tap updates on pointerup.
    inputs.length = 0;
    changes.length = 0;
    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 40, clientY: 20 }));
    el.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 40, clientY: 20 }));
    expect(inputs.length).toBe(1);
    expect(changes).toEqual([inputs[0]]);
    expect(el.value).toBeLessThan(30);

    // Touch events must not bubble to ancestor swipe-navigation handlers.
    let bubbled = 0;
    document.body.addEventListener('touchstart', () => bubbled++);
    document.body.addEventListener('touchmove', () => bubbled++);
    document.body.addEventListener('touchend', () => bubbled++);
    el.dispatchEvent(new Event('touchstart', { bubbles: true }));
    el.dispatchEvent(new Event('touchmove', { bubbles: true }));
    el.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(bubbled).toBe(0);
  });
});

describe('m3e-wavy-progress touch scroll & swipe protection', () => {
  async function makeProgress() {
    const el = document.createElement('m3e-wavy-progress') as M3eWavyProgress;
    el.seekable = true;
    el.value = 0.5;
    document.body.appendChild(el);
    await el.updateComplete;
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(rect200);
    const inputs: number[] = [];
    const changes: number[] = [];
    el.addEventListener('input', (e) => inputs.push((e as CustomEvent<{ value: number }>).detail.value));
    el.addEventListener('change', (e) => changes.push((e as CustomEvent<{ value: number }>).detail.value));
    return { el, inputs, changes };
  }

  it('ignores vertical touch scroll, updates on horizontal drag/tap, and blocks swipe bubbling', async () => {
    const { el, inputs, changes } = await makeProgress();
    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 160, clientY: 8 }));
    el.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 162, clientY: 24 }));
    el.dispatchEvent(ptr('pointercancel', { pointerType: 'touch', clientX: 162, clientY: 30 }));
    expect(el.value).toBe(0.5);
    expect(inputs).toEqual([]);
    expect(changes).toEqual([]);

    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 8 }));
    el.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 150, clientY: 8 }));
    el.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 150, clientY: 8 }));
    expect(inputs).toEqual([0.75]);
    expect(changes).toEqual([0.75]);

    el.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 40, clientY: 8 }));
    el.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 40, clientY: 8 }));
    expect(changes.at(-1)).toBeCloseTo(0.2);

    let bubbled = 0;
    document.body.addEventListener('touchmove', () => bubbled++);
    el.dispatchEvent(new Event('touchmove', { bubbles: true }));
    expect(bubbled).toBe(0);
  });
});

describe('m3e-line-chart touch scrub protection', () => {
  it('ignores vertical touch scroll, scrubs on horizontal touch drag and mouse hover', async () => {
    const chart = document.createElement('m3e-line-chart') as M3eLineChart;
    chart.values = [10, 20, 30, 40, 50];
    chart.scrub = true;
    document.body.appendChild(chart);
    await chart.updateComplete;
    vi.spyOn(chart, 'getBoundingClientRect').mockImplementation(rect200);
    const plot = $(chart, '.plot')!;
    const scrubs: (number | null)[] = [];
    chart.addEventListener('scrub', (e) => scrubs.push((e as CustomEvent<{ index: number | null }>).detail.index));

    // Vertical touch scroll must not trigger scrub.
    plot.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 10 }));
    plot.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 102, clientY: 30 }));
    plot.dispatchEvent(ptr('pointercancel', { pointerType: 'touch', clientX: 102, clientY: 35 }));
    expect(scrubs).toEqual([]);

    // Horizontal touch drag scrubs and clears on release.
    plot.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 10 }));
    plot.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 150, clientY: 11 }));
    plot.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 150, clientY: 11 }));
    expect(scrubs).toEqual([3, null]);

    // Mouse hover continues to scrub without pressing down.
    scrubs.length = 0;
    plot.dispatchEvent(ptr('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 10 }));
    plot.dispatchEvent(ptr('pointerleave', { pointerType: 'mouse' }));
    expect(scrubs).toEqual([1, null]);
  });
});
