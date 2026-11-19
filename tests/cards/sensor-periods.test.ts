// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/sensor-card';
import { periodLabel, periodOptions } from '../../src/cards/sensor-card';
import { $, $$, deferred, ent, key, mockHass, mount, settle, text } from '../helpers/dom';

const temp = ent('sensor.t', '21', { device_class: 'temperature', unit_of_measurement: '°C' });
const span = (msg: unknown) => {
  const m = msg as { start_time: string; end_time: string };
  return (Date.parse(m.end_time) - Date.parse(m.start_time)) / 3600_000;
};
const history = async (msg: unknown) => {
  const h = span(msg);
  const now = Math.floor(Date.now() / 1000);
  return { 'sensor.t': [{ s: String(h), lu: now - h * 1800 }] };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sensor period buttons', () => {
  it('lists the periods with the configured hours, sorted and without repeats', () => {
    expect(periodOptions({})).toEqual([6, 24, 168]);
    expect(periodOptions({ hours: 12 })).toEqual([6, 12, 24, 168]);
    expect(periodOptions({ periods: ['72', 24, 24, 'x', 0] })).toEqual([24, 72]);
    expect([1, 24, 36, 48, 168].map(periodLabel)).toEqual(['1時間', '24時間', '36時間', '2日', '7日']);
  });

  it('switches the chart to another period and back', async () => {
    const hass = mockHass([temp]);
    hass.callWS.mockImplementation(history);
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    const group = $(card, 'm3e-button-group')!;
    const buttons = () => $$(group, 'button');
    expect(buttons().map(text)).toEqual(['6時間', '24時間', '7日']);
    expect(buttons().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);

    buttons()[2].click();
    await settle(card);
    expect(span(hass.callWS.mock.calls.at(-1)![0])).toBe(168);
    expect(text($(card, '.sub'))).toMatch(/^過去7日間・\d+:\d\d 更新$/);
    // A week is labelled by dates, not hours.
    expect(text($(card, '.axis'))).toMatch(/\d+\/\d+/);
    expect(text($(card, '.axis'))).not.toContain('時');

    // Arrow keys move through the periods (a radio group).
    key(buttons()[2], 'ArrowLeft');
    await settle(card);
    expect(span(hass.callWS.mock.calls.at(-1)![0])).toBe(24);
    expect(text($(card, '.sub'))).toMatch(/^過去24時間/);
  });

  it('drops a slow answer for the period it switched away from', async () => {
    const hass = mockHass([temp]);
    const week = deferred<unknown>();
    hass.callWS.mockImplementation((msg: unknown) => (span(msg) === 168 ? week.promise : history(msg)));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    const buttons = () => $$($(card, 'm3e-button-group')!, 'button');
    buttons()[2].click();
    await settle(card);
    buttons()[0].click();
    await settle(card);
    week.resolve({ 'sensor.t': [{ s: '999', lu: Math.floor(Date.now() / 1000) - 60 }] });
    await settle(card);
    expect(text($(card, '.sub'))).toMatch(/^過去6時間/);
    expect(text($(card, '.stats'))).not.toContain('999');
  });

  it('a config change goes back to the configured hours', async () => {
    const hass = mockHass([temp]);
    hass.callWS.mockImplementation(history);
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    $$($(card, 'm3e-button-group')!, 'button')[0].click();
    await settle(card);
    card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', hours: 24, name: '室温' });
    await settle(card);
    expect(text($(card, '.sub'))).toMatch(/^過去24時間/);
  });

  it('can be turned off, and is never shown on the compact layout', async () => {
    const hass = mockHass([temp]);
    hass.callWS.mockImplementation(history);
    const off = await mount('m3e-sensor-card', { entity: 'sensor.t', show_period_selector: false }, hass);
    expect($(off, 'm3e-button-group')).toBeNull();
    const compact = await mount('m3e-sensor-card', { entity: 'sensor.t', layout: 'compact' }, hass);
    expect($(compact, 'm3e-button-group')).toBeNull();
  });

  it('refuses periods out of range', () => {
    const card = document.createElement('m3e-sensor-card') as HTMLElement & { setConfig(c: object): void };
    expect(() => card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', periods: [6, 0] })).toThrow('periods.1 must be a number of hours from 1 to 8760');
    expect(() => card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', periods: [6, 0.5] })).toThrow('periods.1 must be a number of hours from 1 to 8760');
    expect(() => card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', periods: ['6', '24'] })).not.toThrow();
  });

  it('keeps full resolution and date ticks for 48h, minute ticks for 1h, and refetches on reconnect', async () => {
    const hass = mockHass([temp]);
    hass.callWS.mockImplementation(history);
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t', hours: 48, periods: [1, 48] }, hass);
    expect(text($(card, '.axis'))).toMatch(/\d+\/\d+/);
    const chart = $(card, 'm3e-line-chart') as HTMLElement & { values: (number | null)[] };
    expect(chart.values.length).toBeGreaterThanOrEqual(48);

    $$($(card, 'm3e-button-group')!, 'button')[0].click();
    await settle(card);
    expect(text($(card, '.axis'))).toMatch(/\d+:\d{2}/);

    card.remove();
    document.body.appendChild(card);
    await settle(card);
    expect(hass.callWS).toHaveBeenCalledTimes(3);
  });
});
