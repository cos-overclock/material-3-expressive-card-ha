// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/index';
import { $$, mockHass, settle, text } from '../helpers/dom';

type Editor = HTMLElement & { setConfig(c: object): void; updateComplete: Promise<boolean> };
type CardClass = CustomElementConstructor & { getConfigElement(): Editor };
const card = (tag: string) => document.createElement(tag) as HTMLElement & { setConfig(c: object): void };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('setConfig refuses misconfigured cards', () => {
  it.each([
    ['m3e-sensor-card', { entity: 'sensor.t', hours: 0 }, 'hours must be a number from 1 to 8760'],
    ['m3e-sensor-card', { entity: 'sensor.t', decimals: -1 }, 'decimals must be a whole number from 0 to 6'],
    ['m3e-value-card', { entity: 'sensor.t', min: 10, max: 5 }, 'max must be larger than min'],
    ['m3e-weather-card', { entity: 'sensor.t' }, 'entity must be a weather entity'],
    ['m3e-lock-card', { entity: 'switch.door' }, 'entity must be a lock entity'],
    ['m3e-agenda-card', { calendars: ['todo.shop'] }, 'calendars.0 must be a calendar entity'],
    ['m3e-garbage-card', { schedule: [{ type: 'びん', days: ['thu'], weeks: [6] }] }, 'schedule.0.weeks: 6 must be 1 to 5'],
    ['m3e-garbage-card', { schedule: [{ type: 'びん', dates: ['2026-02-30'] }] }, 'schedule.0.dates: 2026-02-30 must be a date like 2026-12-31'],
    ['m3e-garbage-card', { schedule: [{ type: 'びん', days: ['thu'] }], deadline: '8時' }, 'deadline must be a time like 08:30'],
    ['m3e-badges-card', { badges: [{ type: 'count', domain: 'Light' }] }, 'badges.0.domain must be a domain like light or binary_sensor'],
    ['m3e-heading-card', { title: 'x', summary: { type: 'average' } }, 'summary: an average needs entities'],
    ['m3e-energy-flow-card', { period: 'year' }, 'period must be one of: day, week, month'],
    ['m3e-tile-card', { entity: 'light.a', density: 'tiny' }, 'density must be one of: auto, compact, comfortable'],
    ['m3e-sensor-card', { entity: 'sensor.t', periods: [6, 0.5] }, 'periods.1 must be a number of hours from 1 to 8760'],
    ['m3e-garbage-card', { schedule: [{ type: 'びん', days: ['thu'], weeks: [true] }] }, 'schedule.0.weeks: true must be 1 to 5'],
    ['m3e-agenda-card', { calendars: 'calendar.home' }, 'calendars must be a list'],
    ['m3e-badges-card', { badges: 'sensor.a' }, 'badges: list at least one badge'],
  ])('%s %j', (tag, config, message) => {
    expect(() => card(tag).setConfig({ type: `custom:${tag}`, ...config })).toThrow(message);
  });

  it('accepts what the warnings are about', () => {
    expect(() =>
      card('m3e-sensor-card').setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', levels: [{ label: 'a' }, { max: 5, label: 'b' }] }),
    ).not.toThrow();
  });
});

describe('the editor lists the issues while editing', () => {
  it('errors first, then warnings, in Japanese, and updates as the config changes', async () => {
    const editor = (customElements.get('m3e-sensor-card') as CardClass).getConfigElement();
    (editor as unknown as { hass: unknown }).hass = mockHass([]);
    document.body.appendChild(editor);
    editor.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', hours: 0, levels: [{ label: 'a' }, { max: 5, label: 'b' }] });
    await settle(editor);
    const items = $$(editor, '.issue');
    expect(items.map((li) => li.className.replace('issue ', '').trim())).toEqual(['error', 'warning']);
    expect(text(items[0])).toContain('グラフの時間は1〜8760時間の数値にしてください（いまは 0）');

    editor.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', hours: 24 });
    await settle(editor);
    expect($$(editor, '.issue')).toEqual([]);
  });

  it('lists errors for non-array YAML lists instead of hiding all issues', async () => {
    const editor = (customElements.get('m3e-agenda-card') as CardClass).getConfigElement();
    (editor as unknown as { hass: unknown }).hass = mockHass([]);
    document.body.appendChild(editor);
    editor.setConfig({ type: 'custom:m3e-agenda-card', calendars: 'calendar.home', days: 0 });
    await settle(editor);
    const items = $$(editor, '.issue');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(text(items[0])).toContain('カレンダーはリストで書いてください');
  });
});
