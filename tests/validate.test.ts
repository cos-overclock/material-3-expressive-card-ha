import { describe, expect, it } from 'vitest';
import { checkDomain, checkEntity, checkLevels, checkNumber, checkOneOf, checkSummary, checkTime, isDate } from '../src/editor/validate';

const paths = (issues: { path: string; level: string }[]) => issues.map((i) => `${i.level}:${i.path}`);

describe('config checks', () => {
  it('numbers: range, whole numbers, and strings from YAML', () => {
    const opts = { min: 1, max: 8760, label: 'グラフの時間' };
    expect(checkNumber({ hours: 24 }, 'hours', opts)).toEqual([]);
    expect(checkNumber({}, 'hours', opts)).toEqual([]);
    expect(paths(checkNumber({ hours: 0 }, 'hours', opts))).toEqual(['error:hours']);
    expect(checkNumber({ hours: '24' }, 'hours', opts)[0].message).toBe('hours must be a number from 1 to 8760');
    expect(checkNumber({ hours: 0 }, 'hours', opts)[0].hint).toBe('グラフの時間は1〜8760の数値にしてください（いまは 0）');
    expect(paths(checkNumber({ decimals: 1.5 }, 'decimals', { min: 0, max: 6, integer: true, label: '桁数' }))).toEqual(['error:decimals']);
    expect(paths(checkNumber({}, 'x', { label: 'x', required: true }))).toEqual(['error:x']);
  });

  it('one-of values; an emptied select counts as unset', () => {
    expect(checkOneOf({ layout: 'full' }, 'layout', ['full', 'compact'], 'レイアウト')).toEqual([]);
    expect(checkOneOf({ layout: '' }, 'layout', ['full', 'compact'], 'レイアウト')).toEqual([]);
    expect(checkOneOf({ layout: 'big' }, 'layout', ['full', 'compact'], 'レイアウト')[0].message).toBe('layout must be one of: full, compact');
  });

  it('entities: id shape and domain', () => {
    expect(checkEntity({ entity: 'lock.front' }, 'entity', ['lock'], '鍵')).toEqual([]);
    expect(checkEntity({ entity: 'switch.front' }, 'entity', ['lock'], '鍵')[0].message).toBe('entity must be a lock entity');
    expect(checkEntity({ entity: 'Lock Front' }, 'entity', ['lock'], '鍵')[0].message).toBe('entity must be an entity id like light.living');
    expect(checkEntity({}, 'entity', ['lock'], '鍵', true)[0].message).toBe('entity is required');
    expect(checkEntity({ entity: 'fan.a' }, 'entity', ['fan', 'humidifier'], 'x')).toEqual([]);
  });

  it('domains: lower-case names, with a hint when an entity id was written', () => {
    expect(checkDomain({ domain: 'binary_sensor' }, 'domain', 'ドメイン')).toEqual([]);
    expect(checkDomain({ domain: 'Light' }, 'domain', 'ドメイン')).toHaveLength(1);
    expect(checkDomain({ domain: 'light.living' }, 'domain', 'ドメイン')[0].hint).toContain('entities');
  });

  it('times and dates', () => {
    expect(checkTime({ t: '08:30' }, 't', '時刻')).toEqual([]);
    expect(checkTime({ t: '8:30' }, 't', '時刻')).toEqual([]);
    expect(checkTime({ t: '24:00' }, 't', '時刻')).toHaveLength(1);
    expect(checkTime({ t: '0830' }, 't', '時刻')).toHaveLength(1);
    expect(isDate('2026-12-31')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026/12/31')).toBe(false);
  });

  it('levels: labels, numeric bounds, order, and a missing bound before the last', () => {
    expect(checkLevels({ levels: [{ max: 1000, label: '良好' }, { label: '換気を' }] })).toEqual([]);
    expect(
      paths(
        checkLevels({
          levels: [{ max: 25, label: '快適' }, { label: '暑い' }, { max: 20, label: '寒い' }, { max: 'x', label: 'y' }, { max: 30 }],
        }),
      ),
    ).toEqual(['warning:levels.1.max', 'warning:levels.2.max', 'error:levels.3.max', 'error:levels.4.label']);
  });

  it('summaries: type, domain, decimals and what each type needs', () => {
    const at = (summary: unknown) => paths(checkSummary({ summary }, 'summary', '要約'));
    expect(at({ type: 'count', domain: 'light' })).toEqual([]);
    expect(at({ type: 'date' })).toEqual([]);
    expect(at({ type: 'sum', entities: ['sensor.a'] })).toEqual(['error:summary.type']);
    expect(at({ type: 'count' })).toEqual(['error:summary.domain']);
    expect(at({ type: 'average', domain: 'sensor' })).toEqual(['error:summary.entities']);
    expect(at({ type: 'average', entities: ['sensor.a', 'oops'], decimals: -1 })).toEqual(['error:summary.decimals', 'error:summary.entities.1']);
  });
});
