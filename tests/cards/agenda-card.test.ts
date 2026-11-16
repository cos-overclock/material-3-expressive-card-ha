// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/agenda-card';
import { $, $$, deferred, ent, key, mockHass, mount, quietWarnings, settle, text } from '../helpers/dom';

const items = (...names: string[]) => ({ items: names.map((n, i) => ({ uid: `u${i}`, summary: n, status: 'needs_action' })) });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m3e-agenda-card to-do', () => {
  it('ticks an item with Space and Enter', async () => {
    const hass = mockHass([ent('todo.shop', '2', { friendly_name: '買い物' })]);
    hass.callWS.mockResolvedValue(items('牛乳', '卵'));
    const card = await mount('m3e-agenda-card', { todo: 'todo.shop', hide_add: true }, hass);
    const [milk] = $$(card, '.item');
    expect(milk.getAttribute('role')).toBe('checkbox');

    key(milk, ' ');
    await settle(card);
    expect(hass.callService).toHaveBeenCalledWith('todo', 'update_item', { item: 'u0', status: 'completed' }, { entity_id: 'todo.shop' });

    key($$(card, '.item').find((el) => text(el).includes('卵'))!, 'Enter');
    await settle(card);
    expect(hass.callService).toHaveBeenLastCalledWith('todo', 'update_item', { item: 'u1', status: 'completed' }, { entity_id: 'todo.shop' });
  });

  it('puts an item back and says so when the update fails', async () => {
    const warn = quietWarnings();
    const hass = mockHass([ent('todo.shop', '1')]);
    hass.callWS.mockResolvedValue(items('牛乳'));
    const sent = deferred<unknown>();
    hass.callService.mockReturnValueOnce(sent.promise);
    const card = await mount('m3e-agenda-card', { todo: 'todo.shop', hide_add: true }, hass);

    $$(card, '.item')[0].click();
    await settle(card);
    // Optimistic: ticked and marked as sending.
    let item = $$(card, '.item')[0];
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(item.getAttribute('aria-busy')).toBe('true');

    sent.reject(new Error('unavailable'));
    await settle(card);
    item = $$(card, '.item')[0];
    expect(item.getAttribute('aria-checked')).toBe('false');
    expect(item.getAttribute('aria-busy')).toBe('false');
    expect(text($(card, '.error[role=alert]'))).toContain('「牛乳」を更新できませんでした');
    warn.mockRestore();
  });

  it('shows a failed list fetch with a retry button', async () => {
    const warn = quietWarnings();
    const hass = mockHass([ent('todo.shop', '1')]);
    hass.callWS.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(items('牛乳'));
    const card = await mount('m3e-agenda-card', { todo: 'todo.shop', hide_add: true }, hass);
    expect(text($(card, 'm3e-fetch-status'))).toContain('リストを取得できませんでした');
    // No "すべて完了" for a list that couldn't be read.
    expect(text($(card, '.meta'))).toBe('');

    $(card, 'm3e-fetch-status', 'button.retry')!.click();
    await settle(card);
    expect($$(card, '.item').map(text)).toEqual(['牛乳']);
    expect($(card, 'm3e-fetch-status', '[role=alert]')).toBeNull();
    warn.mockRestore();
  });

  it('switching lists clears the old items and ignores the old list’s late answer', async () => {
    const hass = mockHass([ent('todo.a', '1'), ent('todo.b', '1')]);
    const slowA = deferred<unknown>();
    hass.callWS.mockImplementation(async (msg: { entity_id: string }) => (msg.entity_id === 'todo.a' ? slowA.promise : items('B の項目')));
    const card = await mount('m3e-agenda-card', { todo: 'todo.a', hide_add: true }, hass);

    card.setConfig({ type: 'custom:m3e-agenda-card', todo: 'todo.b', hide_add: true });
    await settle(card);
    expect($$(card, '.item').map(text)).toEqual(['B の項目']);

    slowA.resolve(items('A の項目'));
    await settle(card);
    expect($$(card, '.item').map(text)).toEqual(['B の項目']);
  });
});

describe('m3e-agenda-card calendars', () => {
  it('tells "no events" apart from "couldn’t fetch", and retries', async () => {
    const warn = quietWarnings();
    const hass = mockHass([ent('calendar.home', 'off')]);
    hass.callApi.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const card = await mount('m3e-agenda-card', { calendars: ['calendar.home'] }, hass);
    expect(text($(card, 'm3e-fetch-status'))).toContain('予定を取得できませんでした');
    expect(text(card)).not.toContain('予定はありません');

    $(card, 'm3e-fetch-status', 'button.retry')!.click();
    await settle(card);
    expect(hass.callApi).toHaveBeenCalledTimes(2);
    expect(text(card)).toContain('予定はありません');
    expect(text($(card, 'm3e-fetch-status'))).toMatch(/\d+:\d\d 更新/);
    warn.mockRestore();
  });
});
