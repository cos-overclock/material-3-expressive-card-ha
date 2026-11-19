// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptimisticState } from '../src/ha/optimistic-state';
import { hideSnackbar, showSnackbar } from '../src/components/m3e-snackbar';
import '../src/cards/vacuum-card';
import { $, $$, ent, mockHass, mount, quietWarnings, settle, text, withState } from './helpers/dom';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  hideSnackbar();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('OptimisticState', () => {
  it('holds guess until confirmed, overrides on error, and expires by TTL', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const opt = new OptimisticState<string>({
      ttlMs: 5000,
      overriding: ['error', 'unavailable'],
      onExpire,
    });

    expect(opt.resolve('docked')).toEqual({ value: 'docked', pending: false });
    opt.set('cleaning');
    expect(opt.pending).toBe(true);
    expect(opt.resolve('docked')).toEqual({ value: 'cleaning', pending: true });

    // Overriding state clears guess immediately.
    expect(opt.resolve('error')).toEqual({ value: 'error', pending: false });
    expect(opt.pending).toBe(false);

    // Matching real state clears guess cleanly.
    opt.set('cleaning');
    expect(opt.resolve('cleaning')).toEqual({ value: 'cleaning', pending: false });
    expect(opt.pending).toBe(false);

    // TTL expiration clears guess and invokes onExpire.
    opt.set('paused');
    vi.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(opt.pending).toBe(false);
    expect(opt.resolve('docked')).toEqual({ value: 'docked', pending: false });
  });
});

describe('m3e-snackbar', () => {
  it('mounts once, fires undo action and closes, and auto-dismisses', async () => {
    vi.useFakeTimers();
    const undo = vi.fn();
    const el1 = showSnackbar({ message: '操作しました', action: { label: '元に戻す', onAction: undo }, durationMs: 3000 })!;
    await el1.updateComplete;
    expect(document.querySelectorAll('m3e-snackbar').length).toBe(1);
    expect(text(el1)).toContain('操作しました');
    expect($(el1, '.bar')?.classList.contains('open')).toBe(true);

    $(el1, 'button.action')!.click();
    await el1.updateComplete;
    expect(undo).toHaveBeenCalledTimes(1);
    expect($(el1, '.bar')?.classList.contains('open')).toBe(false);

    const el2 = showSnackbar({ message: '2件目', durationMs: 2000 })!;
    await el2.updateComplete;
    expect(el2).toBe(el1);
    expect($(el2, '.bar')?.classList.contains('open')).toBe(true);
    vi.advanceTimersByTime(2000);
    await el2.updateComplete;
    expect($(el2, '.bar')?.classList.contains('open')).toBe(false);
  });
});

describe('m3e-vacuum-card optimistic state', () => {
  it('shows pending state immediately, settles on confirmation, and rolls back on failure', async () => {
    const hass = mockHass([ent('vacuum.robot', 'docked')]);
    const card = await mount('m3e-vacuum-card', { entity: 'vacuum.robot' }, hass);
    expect(text($(card, '.state'))).toBe('充電台');

    $$(card, 'button.act')[0].click();
    await card.updateComplete;
    expect(text($(card, '.state'))).toBe('掃除中…');
    expect($(card, '.actions')?.classList.contains('pending')).toBe(true);
    expect($(card, '.actions')?.getAttribute('aria-busy')).toBe('true');

    // HA confirms the state.
    card.hass = withState(hass, ent('vacuum.robot', 'cleaning'));
    await card.updateComplete;
    expect(text($(card, '.state'))).toBe('掃除中');
    expect($(card, '.actions')?.classList.contains('pending')).toBe(false);

    // Failed service call rolls back optimistic state.
    const warn = quietWarnings();
    hass.callService.mockRejectedValueOnce(new Error('offline'));
    $$(card, 'button.act')[0].click(); // pause while cleaning
    await settle(card);
    expect(text($(card, '.state'))).toBe('掃除中');
    expect($(card, '.actions')?.classList.contains('pending')).toBe(false);
    warn.mockRestore();
  });
});
