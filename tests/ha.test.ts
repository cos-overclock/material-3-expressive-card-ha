import { describe, expect, it, vi } from 'vitest';
import { formatSensor } from '../src/ha/format';
import { debounce, entityIdsOfDomain, hhmm, numState, relativeTime } from '../src/ha/helpers';
import { summaryText } from '../src/ha/summary';
import { energySources, flows, kwh, PREFS_TTL_MS, range } from '../src/ha/energy';
import { ruleHits } from '../src/ha/garbage-rules';
import { formatDuration, hms, parseDuration, presetLabel } from '../src/ha/duration';
import { upcoming } from '../src/ha/weather';
import { idsToObjects } from '../src/editor/form-helpers';
import type { HassEntity, HomeAssistant } from '../src/ha/types';

const ent = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: '',
  last_updated: '',
});

const hassWith = (list: HassEntity[], extra: Partial<HomeAssistant> = {}): HomeAssistant => ({
  states: Object.fromEntries(list.map((e) => [e.entity_id, e])),
  callService: async () => undefined,
  ...extra,
});

describe('formatSensor', () => {
  it('formats temperature, humidity and power the cards’ way', () => {
    expect(formatSensor(ent('sensor.t', '21.84', { device_class: 'temperature', unit_of_measurement: '°C' }))).toBe('21.8°');
    expect(formatSensor(ent('sensor.h', '45.4', { device_class: 'humidity', unit_of_measurement: '%' }))).toBe('45%');
    expect(formatSensor(ent('sensor.p', '1240', { unit_of_measurement: 'W' }))).toBe('1.24 kW');
    expect(formatSensor(ent('sensor.w', '184.0', { unit_of_measurement: 'L' }))).toBe('184 L');
  });

  it('keeps °F and K so they are not read as °C', () => {
    expect(formatSensor(ent('sensor.t', '70.25', { device_class: 'temperature', unit_of_measurement: '°F' }))).toBe('70.3°F');
    expect(formatSensor(ent('sensor.t', '295', { device_class: 'temperature', unit_of_measurement: 'K' }))).toBe('295.0 K');
  });

  it('honours the display precision from the entity registry', () => {
    const s = ent('sensor.t', '21.84', { device_class: 'temperature', unit_of_measurement: '°C' });
    const hass = hassWith([s], { entities: { 'sensor.t': { entity_id: 'sensor.t', display_precision: 0 } } });
    expect(formatSensor(s, hass)).toBe('22°');
    expect(formatSensor(ent('sensor.x', '3.14159', { unit_of_measurement: 'V', display_precision: 3 }))).toBe('3.142 V');
  });

  it('shows a dash for unavailable and text as is', () => {
    expect(formatSensor(ent('sensor.t', 'unavailable'))).toBe('—');
    expect(formatSensor(undefined)).toBe('—');
    expect(formatSensor(ent('sensor.s', '洗い'))).toBe('洗い');
  });
});

describe('helpers', () => {
  it('relativeTime', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(relativeTime('2026-11-16T11:59:30Z', now)).toBe('たった今');
    expect(relativeTime('2026-11-16T11:57:00Z', now)).toBe('3分前');
    expect(relativeTime('2026-11-16T09:00:00Z', now)).toBe('3時間前');
    expect(relativeTime('2026-11-14T12:00:00Z', now)).toBe('2日前');
    expect(relativeTime('not a date', now)).toBe('');
  });

  it('hhmm and numState', () => {
    expect(hhmm(new Date(2026, 10, 16, 9, 5))).toBe('9:05');
    expect(hhmm(undefined)).toBe('');
    expect(numState(ent('sensor.a', '12.5'))).toBe(12.5);
    expect(numState(ent('sensor.a', ''))).toBeUndefined();
    expect(numState(ent('sensor.a', 'on'))).toBeUndefined();
  });

  it('entityIdsOfDomain reuses its scan while the entity set is unchanged, and rescans when it changes', () => {
    const a = hassWith([ent('light.a', 'on'), ent('switch.b', 'off')]);
    expect(entityIdsOfDomain(a, 'light')).toEqual(['light.a']);
    const b = hassWith([ent('light.a', 'off'), ent('switch.b', 'off')]);
    const first = entityIdsOfDomain(b, 'light');
    expect(entityIdsOfDomain(b, 'light')).toBe(first);
    const c = hassWith([ent('light.a', 'off'), ent('switch.b', 'off'), ent('light.c', 'on')]);
    expect(entityIdsOfDomain(c, 'light')).toEqual(['light.a', 'light.c']);
    // Same count, but one id replaced by another: rescanned.
    const d = hassWith([ent('light.a', 'off'), ent('switch.b', 'off'), ent('light.z', 'on')]);
    expect(entityIdsOfDomain(d, 'light')).toEqual(['light.a', 'light.z']);
    // Same count, the domain's ids all still there, but another domain's id replaced by one of this domain.
    const e = hassWith([ent('light.a', 'off'), ent('light.z', 'on'), ent('light.c', 'on')]);
    expect(entityIdsOfDomain(e, 'light')).toEqual(['light.a', 'light.z', 'light.c']);
    expect(entityIdsOfDomain(e, 'switch')).toEqual([]);
  });

  it('debounce sends the last value once, and flush sends it now', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledExactlyOnceWith(2);
    d(3);
    d.flush();
    expect(fn).toHaveBeenLastCalledWith(3);
    vi.useRealTimers();
  });
});

describe('summaryText', () => {
  const hass = hassWith([
    ent('cover.a', 'open'),
    ent('cover.b', 'closed'),
    ent('cover.c', 'opening'),
    ent('sensor.t1', '20', { unit_of_measurement: '°C' }),
    ent('sensor.t2', '23', { unit_of_measurement: '°C' }),
    ent('sensor.f', '70', { unit_of_measurement: '°F' }),
  ]);

  it('counts matching states and fills every placeholder', () => {
    const s = { type: 'count' as const, entities: ['cover.a', 'cover.b', 'cover.c'], state: ['open', 'opening'], text: '{n}/{total}（閉 {rest}）・{n}' };
    expect(summaryText(hass, s)).toBe('2/3（閉 1）・2');
  });

  it('uses zero_text when nothing matches', () => {
    expect(summaryText(hass, { type: 'count', entities: ['cover.b'], state: 'open', text: '{n}か所', zero_text: 'すべて閉' })).toBe('すべて閉');
  });

  it('never reads missing or unavailable entities as all clear', () => {
    const h = hassWith([ent('lock.front', 'locked'), ent('lock.back', 'unavailable'), ent('binary_sensor.w', 'unknown')]);
    const s = { type: 'count' as const, entities: ['lock.front', 'lock.back', 'binary_sensor.w', 'lock.gone'], state: 'unlocked', text: '{n}件を確認', zero_text: 'すべて正常' };
    expect(summaryText(h, s)).toBe('3件不明');
    expect(summaryText(h, { ...s, unknown_text: '通信不能 {unknown}' })).toBe('通信不能 3');
    // Some match: the unknown count is added; {rest} only counts the known ones.
    const open = hassWith([ent('lock.front', 'unlocked'), ent('lock.back', 'unavailable'), ent('lock.side', 'locked')]);
    const t = { type: 'count' as const, entities: ['lock.front', 'lock.back', 'lock.side'], text: '{n}件・施錠 {rest}件', zero_text: 'すべて施錠' };
    expect(summaryText(open, t)).toBe('1件・施錠 1件・1件不明');
    expect(summaryText(open, { ...t, text: '{n}/{total}（不明 {unknown}）' })).toBe('1/3（不明 1）');
    // All known and none matching: zero_text as before.
    expect(summaryText(open, { ...t, entities: ['lock.side'] })).toBe('すべて施錠');
  });

  it('counts a listed "unavailable" state as matching, not unknown', () => {
    const h = hassWith([ent('sensor.a', 'unavailable'), ent('sensor.b', 'ok')]);
    expect(summaryText(h, { type: 'count', entities: ['sensor.a', 'sensor.b'], state: 'unavailable', text: '{n}台が応答なし', zero_text: 'すべて応答' })).toBe('1台が応答なし');
  });

  it('averages with the unit', () => {
    expect(summaryText(hass, { type: 'average', entities: ['sensor.t1', 'sensor.t2'] })).toBe('21.5°');
    expect(summaryText(hass, { type: 'average', entities: ['sensor.f'], decimals: 0 })).toBe('70°F');
    expect(summaryText(hass, { type: 'average', entities: ['sensor.none'] })).toBe('—');
  });
});

describe('energy', () => {
  it('splits flows: solar charges the battery first, then exports', () => {
    const f = flows({ solar: 10, gridIn: 3, gridOut: 4, batteryIn: 2, batteryOut: 1 });
    expect(f.solarToBattery).toBe(2);
    expect(f.solarToGrid).toBe(4);
    expect(f.solarToHome).toBe(4);
    expect(f.gridToHome).toBe(3);
    expect(f.batteryToHome).toBe(1);
    expect(f.home).toBe(8);
    expect(f.selfSufficiency).toBeCloseTo(5 / 8);
  });

  it('kwh and ranges', () => {
    expect(kwh(8.64)).toBe('8.6');
    expect(kwh(123.4)).toBe('123');
    const week = range('week', new Date(2026, 10, 19, 15)); // Thursday
    expect(week.start.getDay()).toBe(1);
    expect(week.start.getDate()).toBe(16);
    expect(range('month', new Date(2026, 1, 10)).buckets).toBe(28);
    expect(range('day', new Date(2026, 10, 16, 8)).buckets).toBe(24);
  });
});

describe('energySources', () => {
  const prefs = { energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.solar' }], device_consumption: [] };

  it('asks HA again after a failed fetch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const callWS = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(prefs);
    const hass = hassWith([], { callWS } as unknown as Partial<HomeAssistant>);
    expect(await energySources(hass)).toBeUndefined();
    expect((await energySources(hass))?.solar).toEqual(['sensor.solar']);
    expect(callWS).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('reuses the settings for a while, then fetches them again', async () => {
    const callWS = vi.fn().mockResolvedValue(prefs);
    const hass = hassWith([], { callWS } as unknown as Partial<HomeAssistant>);
    const t = Date.now();
    await energySources(hass, t);
    await energySources(hass, t + PREFS_TTL_MS - 1);
    expect(callWS).toHaveBeenCalledTimes(1);
    await energySources(hass, t + PREFS_TTL_MS);
    expect(callWS).toHaveBeenCalledTimes(2);
  });
});

describe('garbage rules', () => {
  it('matches weekdays, 第N weeks and one-off dates', () => {
    const rule = { type: 'びん・缶', days: ['thu' as const], weeks: [1, 3] };
    expect(ruleHits(rule, new Date(2026, 10, 5))).toBe(true); // 1st Thursday
    expect(ruleHits(rule, new Date(2026, 10, 12))).toBe(false); // 2nd
    expect(ruleHits(rule, new Date(2026, 10, 19))).toBe(true); // 3rd
    expect(ruleHits(rule, new Date(2026, 10, 20))).toBe(false); // Friday
    expect(ruleHits({ type: '燃やす', days: ['tue', 'sat'] }, new Date(2026, 10, 17))).toBe(true);
    expect(ruleHits({ type: '粗大', dates: ['2026-11-25'] }, new Date(2026, 10, 25))).toBe(true);
  });
});

describe('durations', () => {
  it('parses and formats', () => {
    expect(parseDuration('0:05:00')).toBe(300);
    expect(parseDuration('3:00')).toBe(180);
    expect(parseDuration(10)).toBe(600);
    expect(parseDuration('x')).toBeUndefined();
    expect(formatDuration(245.2)).toBe('4:06');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(hms(90)).toBe('0:01:30');
    expect(presetLabel(5400)).toBe('1時間30分');
  });
});

describe('weather and editor helpers', () => {
  it('upcoming drops past hours', () => {
    const now = Date.parse('2026-11-16T12:30:00Z');
    const list = ['10', '11', '12', '13'].map((h) => ({ datetime: `2026-11-16T${h}:00:00Z` }));
    expect(upcoming(list, now).map((f) => f.datetime.slice(11, 13))).toEqual(['12', '13']);
  });

  it('idsToObjects turns plain ids into objects for the list editor', () => {
    expect(idsToObjects({ people: ['person.a', { entity: 'person.b', color: 'pink' }] }, 'people')).toEqual({
      people: [{ entity: 'person.a' }, { entity: 'person.b', color: 'pink' }],
    });
    const same = { people: [{ entity: 'person.a' }] };
    expect(idsToObjects(same, 'people')).toBe(same);
  });
});
