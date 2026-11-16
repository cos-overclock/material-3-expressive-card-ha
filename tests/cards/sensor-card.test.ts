// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/sensor-card';
import { $, $$, deferred, ent, mockHass, mount, quietWarnings, settle, text } from '../helpers/dom';

const temp = (id: string, v: string) => ent(id, v, { device_class: 'temperature', unit_of_measurement: '°C' });
const now = () => Math.floor(Date.now() / 1000);
/** A history/history_during_period answer: two points for each asked entity. */
const historyFor = (msg: { entity_ids: string[] }) =>
  Object.fromEntries(msg.entity_ids.map((id) => [id, [{ s: '20', lu: now() - 3600 }, { s: '21', lu: now() - 60 }]]));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m3e-sensor-card fetch status', () => {
  it('tells a failed fetch apart from no data, and retries', async () => {
    const warn = quietWarnings();
    const hass = mockHass([temp('sensor.t', '21')]);
    hass.callWS.mockRejectedValueOnce(new Error('offline'));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);

    const status = $(card, 'm3e-fetch-status');
    expect(text(status)).toContain('履歴を取得できませんでした');
    expect($(card, 'm3e-fetch-status', '[role=alert]')).not.toBeNull();
    // Without history there are no min / max / mean to show.
    expect($(card, '.stats')).toBeNull();

    hass.callWS.mockImplementation(async (msg) => historyFor(msg));
    $(card, 'm3e-fetch-status', 'button.retry')!.click();
    await settle(card);
    expect(hass.callWS).toHaveBeenCalledTimes(2);
    expect(text(status)).toBe('');
    expect(text($(card, '.sub'))).toMatch(/過去24時間・\d+:\d\d 更新/);
    expect($(card, '.stats')).not.toBeNull();
    warn.mockRestore();
  });

  it('says there is no history when the fetch worked but brought nothing', async () => {
    const hass = mockHass([temp('sensor.t', '21')]);
    hass.callWS.mockResolvedValue({ 'sensor.t': [] });
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    expect(text($(card, '.sub'))).toBe('過去24時間・履歴なし');
    expect($(card, 'm3e-fetch-status', '[role=alert]')).toBeNull();
  });

  it('keeps the earlier history on screen when a refresh fails', async () => {
    const warn = quietWarnings();
    const hass = mockHass([temp('sensor.t', '21')]);
    hass.callWS.mockImplementation(async (msg) => historyFor(msg));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    expect($(card, '.stats')).not.toBeNull();

    hass.callWS.mockRejectedValueOnce(new Error('offline'));
    $(card, 'm3e-fetch-status')!.dispatchEvent(new CustomEvent('retry'));
    await settle(card);
    expect(text($(card, 'm3e-fetch-status'))).toMatch(/\d+:\d\d 時点のデータを表示しています/);
    expect($(card, '.stats')).not.toBeNull();
    warn.mockRestore();
  });

  it('compact layout: the failure is an icon button that retries without opening more-info', async () => {
    const warn = quietWarnings();
    const hass = mockHass([temp('sensor.t', '21')]);
    hass.callWS.mockRejectedValueOnce(new Error('offline'));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t', layout: 'compact' }, hass);
    let moreInfo = 0;
    card.addEventListener('hass-more-info', () => moreInfo++);
    const btn = $(card, 'm3e-fetch-status', 'button')!;
    expect(btn.getAttribute('aria-label')).toContain('履歴を取得できませんでした');
    hass.callWS.mockImplementation(async (msg) => historyFor(msg));
    btn.click();
    await settle(card);
    expect(moreInfo).toBe(0);
    expect(hass.callWS).toHaveBeenCalledTimes(2);
    expect($(card, 'm3e-fetch-status', 'button')).toBeNull();
    warn.mockRestore();
  });
});

describe('m3e-sensor-card config changes', () => {
  it('drops the old history and a late answer for the old entity', async () => {
    const hass = mockHass([temp('sensor.a', '21'), temp('sensor.b', '5')]);
    const first = deferred<unknown>();
    hass.callWS.mockReturnValueOnce(first.promise).mockImplementation(async (msg) => historyFor(msg));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.a' }, hass);

    // Switch entity before sensor.a's history arrives.
    card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.b' });
    await settle(card);
    const asked = hass.callWS.mock.calls.map(([m]) => (m as { entity_ids: string[] }).entity_ids[0]);
    expect(asked).toEqual(['sensor.a', 'sensor.b']);
    expect($(card, '.stats')).not.toBeNull();

    // sensor.a's answer comes last: it must not replace sensor.b's history.
    first.resolve({ 'sensor.a': [{ s: '999', lu: now() - 60 }] });
    await settle(card);
    expect(text($(card, '.stats'))).not.toContain('999');
  });

  it('fetches again when hours changes', async () => {
    const hass = mockHass([temp('sensor.t', '21')]);
    hass.callWS.mockImplementation(async (msg) => historyFor(msg));
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    card.setConfig({ type: 'custom:m3e-sensor-card', entity: 'sensor.t', hours: 6 });
    await settle(card);
    expect(hass.callWS).toHaveBeenCalledTimes(2);
    const [, [msg]] = hass.callWS.mock.calls as [unknown, [{ start_time: string; end_time: string }]];
    expect(Date.parse(msg.end_time) - Date.parse(msg.start_time)).toBe(6 * 3600_000);
    expect(text($(card, '.sub'))).toContain('過去6時間');
    expect($$(card, '.stat').length).toBe(3);
  });
});
