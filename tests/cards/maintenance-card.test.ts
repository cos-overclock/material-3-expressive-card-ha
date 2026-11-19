// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectUnavailable } from '../../src/ha/availability';
import { formatOfflineDuration, realUnavailableSince } from '../../src/ha/state-since';
import { hideSnackbar } from '../../src/components/m3e-snackbar';
import '../../src/cards/maintenance-card';
import { $, $$, ent, key, mockHass, mount, settle, text, withState } from '../helpers/dom';
import type { HomeAssistant } from '../../src/ha/types';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  hideSnackbar();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('availability & state-since helpers', () => {
  it('groups offline devices, ignores helpers/buttons, and respects alive entities', () => {
    const oldTs = '2026-11-17T00:00:00Z';
    const entities = [
      { ...ent('switch.plug_1', 'unavailable'), last_changed: oldTs },
      { ...ent('sensor.plug_1_power', 'unavailable'), last_changed: oldTs },
      { ...ent('button.plug_1_identify', 'unknown'), last_changed: oldTs },
      // Alive utility_meter helper attached to the dead device must NOT keep it online.
      { ...ent('sensor.plug_1_daily', '0.5'), last_changed: oldTs },
      // Partially available device (switch is on, one sensor unavailable) -> NOT offline.
      { ...ent('switch.plug_2', 'on'), last_changed: oldTs },
      { ...ent('sensor.plug_2_power', 'unavailable'), last_changed: oldTs },
      // Orphan entity without device (went offline more recently than d1).
      { ...ent('sensor.orphan_temp', 'unavailable'), last_changed: '2026-11-18T00:00:00Z' },
    ];
    const hass = mockHass(entities, {
      devices: {
        d1: { id: 'd1', name: 'デスクプラグ', area_id: 'study' },
        d2: { id: 'd2', name: 'テレビプラグ', area_id: 'living' },
      },
      areas: {
        study: { area_id: 'study', name: '書斎' },
        living: { area_id: 'living', name: 'リビング' },
      },
      entities: {
        'switch.plug_1': { entity_id: 'switch.plug_1', device_id: 'd1' },
        'sensor.plug_1_power': { entity_id: 'sensor.plug_1_power', device_id: 'd1' },
        'button.plug_1_identify': { entity_id: 'button.plug_1_identify', device_id: 'd1' },
        'sensor.plug_1_daily': { entity_id: 'sensor.plug_1_daily', device_id: 'd1', platform: 'utility_meter' },
        'switch.plug_2': { entity_id: 'switch.plug_2', device_id: 'd2' },
        'sensor.plug_2_power': { entity_id: 'sensor.plug_2_power', device_id: 'd2' },
      },
    } as Partial<HomeAssistant>);

    const grouped = collectUnavailable(hass);
    expect(grouped.map((u) => [u.key, u.name, u.entity, u.count, u.area])).toEqual([
      ['device:d1', 'デスクプラグ', 'switch.plug_1', 2, '書斎'],
      ['entity:sensor.orphan_temp', 'sensor.orphan_temp', 'sensor.orphan_temp', 1, undefined],
    ]);

    const flat = collectUnavailable(hass, { groupByDevice: false });
    expect(flat.map((u) => u.entity).sort()).toEqual(['sensor.orphan_temp', 'sensor.plug_1_power', 'sensor.plug_2_power', 'switch.plug_1']);
  });

  it('recovers real unavailable start across HA restarts and formats duration', () => {
    const windowStart = Date.parse('2026-11-12T00:00:00Z');
    const realStart = Date.parse('2026-11-16T10:00:00Z');
    const restartAt = Date.parse('2026-11-18T03:00:00Z');
    const res = realUnavailableSince(
      [
        { s: 'on', lc: (realStart - 3600_000) / 1000 },
        { s: 'unavailable', lc: realStart / 1000 },
        { s: 'unknown', lc: restartAt / 1000 },
        { s: 'unavailable', lc: (restartAt + 10_000) / 1000 },
      ],
      windowStart,
    );
    expect(res).toEqual({ at: realStart, older: false });

    const olderRes = realUnavailableSince([{ s: 'unavailable', lc: (windowStart + 10_000) / 1000 }], windowStart);
    expect(olderRes.older).toBe(true);
    expect(formatOfflineDuration(realStart, realStart + 45 * 60_000)).toBe('45分前');
    expect(formatOfflineDuration(realStart, realStart + 5 * 3600_000)).toBe('5時間前');
    expect(formatOfflineDuration(realStart, realStart + 48 * 3600_000)).toBe('2日前');
    expect(formatOfflineDuration(windowStart, realStart, { older: true, windowDays: 7 })).toBe('7日以上前');
  });
});

describe('m3e-maintenance-card B1 enhancements', () => {
  it('renders proportional battery bars, device rows, mute + undo snackbar, duration menu, and recovery pruning', async () => {
    const now = Date.now();
    const twoDaysAgo = new Date(now - 48 * 3600_000).toISOString();
    const hass = mockHass(
      [
        ent('sensor.door_battery', '14', { friendly_name: '玄関電池', device_class: 'battery', unit_of_measurement: '%' }),
        { ...ent('switch.plug_a', 'unavailable', { friendly_name: 'プラグA' }), last_changed: twoDaysAgo },
        { ...ent('sensor.plug_a_w', 'unavailable', { friendly_name: 'プラグA電力' }), last_changed: twoDaysAgo },
        { ...ent('sensor.orphan', 'unavailable', { friendly_name: '孤立センサー' }), last_changed: new Date(now - 2 * 3600_000).toISOString() },
      ],
      {
        devices: { dev_a: { id: 'dev_a', name: 'ベランダプラグ', area_id: 'living' } },
        areas: { living: { area_id: 'living', name: 'リビング' } },
        entities: {
          'switch.plug_a': { entity_id: 'switch.plug_a', device_id: 'dev_a' },
          'sensor.plug_a_w': { entity_id: 'sensor.plug_a_w', device_id: 'dev_a' },
        },
      } as Partial<HomeAssistant>,
    );
    hass.callWS.mockResolvedValue({});

    const card = await mount('m3e-maintenance-card', { critical_hours: 24, mute_default_hours: 12 }, hass);

    // Proportional battery bar sets --pct.
    const batRow = $(card, '.item.battery')!;
    expect(batRow.getAttribute('style')).toContain('--pct:14%');

    // 2 offline items (1 grouped device + 1 orphan), grouped device is >= 24h so critical red `.alert`.
    const rows = $$(card, 'section:last-of-type .item');
    expect(rows.length).toBe(2);
    expect(text(rows[0])).toContain('ベランダプラグ');
    expect(text(rows[0])).toContain('リビング・2項目');
    expect(text(rows[0])).toContain('2日前');
    expect(rows[0].classList.contains('alert')).toBe(true);
    expect(rows[1].classList.contains('warn')).toBe(true);

    // Click bell button -> mutes for default 12h and opens Undo snackbar.
    rows[0].querySelector<HTMLButtonElement>('button.mute-btn')!.click();
    await settle(card);
    expect($$(card, 'section:last-of-type .item').length).toBe(1);
    expect(text($(card, '.muted-chip'))).toBe('ミュート中（1）');

    const sb = document.querySelector('m3e-snackbar') as HTMLElement & { updateComplete: Promise<boolean> };
    await sb.updateComplete;
    expect(text(sb)).toContain('12時間ミュートしました');
    $(sb, 'button.action')!.click();
    await settle(card);
    expect($$(card, 'section:last-of-type .item').length).toBe(2);

    // Shift+Enter opens inline duration menu -> pick 'ずっと' (permanent).
    const bell1 = $$(card, 'button.mute-btn')[1];
    key(bell1, 'Enter', { shiftKey: true });
    await card.updateComplete;
    const opts = $$(card, '.mute-menu button.mute-opt');
    expect(opts.map(text)).toEqual(['1時間', '24時間', '7日間', '復旧まで', 'ずっと']);
    opts[4].click();
    await settle(card);

    // Also mute device:dev_a temporarily ('復旧まで').
    key($$(card, 'button.mute-btn')[0], 'Enter', { shiftKey: true });
    await card.updateComplete;
    $$(card, '.mute-menu button.mute-opt')[3].click();
    await settle(card);
    expect(text($(card, '.muted-chip'))).toBe('ミュート中（2）');

    // Expand muted list & unmute works; recovered temporary device prunes automatically, permanent remains.
    let nextHass = withState(hass, ent('switch.plug_a', 'on'));
    nextHass = withState(nextHass, ent('sensor.plug_a_w', '10'));
    card.hass = nextHass;
    await settle(card);
    expect(text($(card, '.muted-chip'))).toBe('ミュート中（1）');

    $(card, 'button.muted-chip')!.click();
    await card.updateComplete;
    expect(text($(card, '.muted-foot'))).toContain('ずっと');
    $(card, 'button.unmute')!.click();
    await settle(card);
    expect($(card, '.muted-chip')).toBeNull();
  });
});
