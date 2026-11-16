// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/energy-flow-card';
import { $, mockHass, mount, quietWarnings, settle, text } from '../helpers/dom';

afterEach(() => {
  document.body.innerHTML = '';
});

const prefs = { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.grid_in' }], flow_to: [] }], device_consumption: [] };

describe('m3e-energy-flow-card', () => {
  it('shows a failure (not an empty chart) when the energy settings can’t be read, and retries', async () => {
    const warn = quietWarnings();
    // A fresh connection object per test: the energy settings are cached per connection.
    const hass = mockHass([], { connection: {} as never });
    hass.callWS.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'energy/get_prefs') throw new Error('offline');
      return {};
    });
    const card = await mount('m3e-energy-flow-card', {}, hass);
    expect(text($(card, 'm3e-fetch-status'))).toContain('電力量の記録を取得できませんでした');
    expect(text(card)).not.toContain('読み込んでいます');

    hass.callWS.mockImplementation(async (msg: { type: string; statistic_ids?: string[] }) => {
      if (msg.type === 'energy/get_prefs') return prefs;
      return { 'sensor.grid_in': [{ start: Date.now(), change: 1.5 }] };
    });
    $(card, 'm3e-fetch-status', 'button.retry')!.click();
    await settle(card);
    expect($(card, '.flow')).not.toBeNull();
    expect(text($(card, 'm3e-fetch-status'))).toMatch(/\d+:\d\d 更新/);
    warn.mockRestore();
  });

  it('fetches again when the period changes', async () => {
    const hass = mockHass([], { connection: {} as never });
    hass.callWS.mockImplementation(async (msg: { type: string }) => (msg.type === 'energy/get_prefs' ? prefs : {}));
    const card = await mount('m3e-energy-flow-card', {}, hass);
    const stats = () => hass.callWS.mock.calls.filter(([m]) => (m as { type: string }).type === 'recorder/statistics_during_period');
    expect(stats()).toHaveLength(1);
    card.setConfig({ type: 'custom:m3e-energy-flow-card', period: 'month' });
    await settle(card);
    expect(stats()).toHaveLength(2);
    expect((stats()[1][0] as { period: string }).period).toBe('day');
    expect(text(card)).toContain('今月の合計');
  });
});
