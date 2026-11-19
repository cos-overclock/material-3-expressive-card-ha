// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUserData, readLocal, saveUserData } from '../src/ha/user-data';
import { hideSnackbar } from '../src/components/m3e-snackbar';
import '../src/cards/garbage-card';
import { $, ent, mockHass, mount, settle, text } from './helpers/dom';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  hideSnackbar();
  localStorage.clear();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('user-data helper', () => {
  it('persists to HA user data WS and falls back to localStorage when offline', async () => {
    const store = new Map<string, unknown>();
    const hass = mockHass([]);
    hass.callWS.mockImplementation(async (msg: Record<string, unknown>) => {
      if (msg.type === 'frontend/set_user_data') {
        store.set(String(msg.key), msg.value);
        return null;
      }
      if (msg.type === 'frontend/get_user_data') {
        return { value: store.get(String(msg.key)) ?? null };
      }
      return null;
    });

    await saveUserData(hass, 'test_key', { count: 3 });
    expect(readLocal<{ count: number }>('test_key')).toEqual({ count: 3 });
    expect(await loadUserData<{ count: number }>(hass, 'test_key')).toEqual({ count: 3 });

    // WS failure still returns cached localStorage copy.
    hass.callWS.mockRejectedValueOnce(new Error('offline'));
    expect(await loadUserData<{ count: number }>(hass, 'test_key')).toEqual({ count: 3 });

    // WS error on save still writes locally.
    hass.callWS.mockRejectedValueOnce(new Error('offline'));
    await saveUserData(hass, 'test_key', { count: 4 });
    expect(readLocal<{ count: number }>('test_key')).toEqual({ count: 4 });
  });
});

describe('m3e-garbage-card user-data & undo snackbar', () => {
  const allDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

  it('syncs done status via HA user_data and supports undo from snackbar', async () => {
    const store = new Map<string, unknown>();
    const hass = mockHass([ent('sun.sun', 'above_horizon')]);
    hass.callWS.mockImplementation(async (msg: Record<string, unknown>) => {
      if (msg.type === 'frontend/set_user_data') {
        store.set(String(msg.key), msg.value);
        return null;
      }
      if (msg.type === 'frontend/get_user_data') {
        return { value: store.get(String(msg.key)) ?? null };
      }
      return null;
    });

    const card = await mount(
      'm3e-garbage-card',
      {
        deadline: '23:59',
        schedule: [{ type: '燃やすゴミ', days: [...allDays] }],
      },
      hass,
    );

    const btn = $(card, 'button.done-btn')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    await settle(card);

    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(hass.callWS).toHaveBeenCalledWith(expect.objectContaining({ type: 'frontend/set_user_data', key: 'm3e_garbage_done' }));

    // Snackbar shows Undo action.
    const sb = document.querySelector('m3e-snackbar') as HTMLElement & { updateComplete: Promise<boolean> };
    await sb.updateComplete;
    expect(text(sb)).toContain('燃やすゴミ');
    $(sb, 'button.action')!.click();
    await settle(card);
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    // Re-mark and mount a fresh card: loads synced state from HA user_data.
    btn.click();
    await settle(card);
    localStorage.clear();
    card.remove();

    const card2 = await mount(
      'm3e-garbage-card',
      {
        deadline: '23:59',
        schedule: [{ type: '燃やすゴミ', days: [...allDays] }],
      },
      hass,
    );
    expect($(card2, 'button.done-btn')?.getAttribute('aria-pressed')).toBe('true');
  });
});
