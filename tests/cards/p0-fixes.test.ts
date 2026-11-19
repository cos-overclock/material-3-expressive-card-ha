// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/cards/lock-card';
import '../../src/cards/fan-card';
import '../../src/cards/vacuum-card';
import '../../src/cards/tile-card';
import '../../src/components/m3e-keypad';
import '../../src/components/m3e-rolling-text';
import '../../src/components/m3e-switch';
import type { M3eKeypad } from '../../src/components/m3e-keypad';
import type { M3eRollingText } from '../../src/components/m3e-rolling-text';
import type { M3eSwitch } from '../../src/components/m3e-switch';
import { $, $$, ent, key, mockHass, mount, quietWarnings, settle, text, withState } from '../helpers/dom';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function reduceMotion(on: boolean) {
  const real = window.matchMedia?.bind(window);
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    if (query === '(prefers-reduced-motion: reduce)') {
      return { matches: on, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    }
    return real ? real(query) : ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false });
  });
}

describe('P0 fixes', () => {
  it('m3e-lock-card: cancels reduced-motion hold timer on disconnect', async () => {
    reduceMotion(true);
    const hass = mockHass([ent('lock.front', 'locked')]);
    const card = await mount('m3e-lock-card', { entity: 'lock.front', hold_time: 800 }, hass);
    vi.useFakeTimers();
    const control = $(card, '.control')!;
    control.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
    card.remove();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it('m3e-lock-card: fast unlock before pointer release does not re-lock on click', async () => {
    reduceMotion(true);
    let hass = mockHass([ent('lock.front', 'locked')]);
    const card = await mount('m3e-lock-card', { entity: 'lock.front', hold_time: 500 }, hass);
    vi.useFakeTimers();
    const control = $(card, '.control')!;
    control.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(hass.callService).toHaveBeenCalledTimes(1);
    expect(hass.callService.mock.calls[0].slice(0, 2)).toEqual(['lock', 'unlock']);

    // HA reports unlocked before the finger lifts and fires click.
    hass = withState(hass, ent('lock.front', 'unlocked'));
    card.hass = hass;
    await card.updateComplete;
    control.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1, bubbles: true }));
    control.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.callService).toHaveBeenCalledTimes(1);

    // A later normal tap locks as expected.
    await vi.advanceTimersByTimeAsync(10);
    control.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(hass.callService.mock.calls[1].slice(0, 2)).toEqual(['lock', 'lock']);
  });

  it('m3e-keypad: Enter on focused buttons does not double-submit or mis-submit', async () => {
    const pad = document.createElement('m3e-keypad') as M3eKeypad;
    pad.verb = '解錠';
    document.body.appendChild(pad);
    await pad.updateComplete;

    let submits = 0;
    let cancels = 0;
    pad.addEventListener('pin-submit', () => submits++);
    pad.addEventListener('pin-cancel', () => cancels++);

    const keys = $$(pad, 'button');
    // Enter on digit '1' does not submit; clicking/Enter triggers digit entry only.
    keys[0].click();
    key(keys[0], 'Enter');
    await pad.updateComplete;
    expect(submits).toBe(0);

    // Enter on 'やめる' must not submit.
    const cancelBtn = keys.find((b) => text(b) === 'やめる')!;
    key(cancelBtn, 'Enter');
    cancelBtn.click();
    expect(submits).toBe(0);
    expect(cancels).toBe(1);

    // Re-enter a digit and press Enter + click on submit button: must fire once, not twice.
    keys[0].click();
    await pad.updateComplete;
    const submitBtn = $(pad, 'button.go')!;
    key(submitBtn, 'Enter');
    submitBtn.click();
    expect(submits).toBe(1);
  });

  it('m3e-rolling-text: clears previous text under prefers-reduced-motion', async () => {
    reduceMotion(true);
    const el = document.createElement('m3e-rolling-text') as M3eRollingText;
    el.text = '21';
    document.body.appendChild(el);
    await el.updateComplete;
    el.text = '22';
    await el.updateComplete;
    const spans = $$(el, 'span');
    expect(spans[0].textContent).toBe('');
    expect(spans[1].textContent).toBe('22');
  });

  it('m3e-switch: keeps HA state when service call fails', async () => {
    const warn = quietWarnings();
    const hass = mockHass([ent('fan.purifier', 'off', { supported_features: 1 })]);
    hass.callService.mockRejectedValueOnce(new Error('offline'));
    const card = await mount('m3e-fan-card', { entity: 'fan.purifier' }, hass);
    const sw = $(card, 'm3e-switch') as M3eSwitch;
    const btn = $(sw, 'button')!;
    expect(sw.checked).toBe(false);
    btn.click();
    await settle(card);
    expect(sw.checked).toBe(false);
    warn.mockRestore();
  });

  it('m3e-fan-card: rounds fractional percentage_step to an integer', async () => {
    const hass = mockHass([ent('fan.living', 'on', { percentage: 33, percentage_step: 33.333333333333336, supported_features: 1 })]);
    const card = await mount('m3e-fan-card', { entity: 'fan.living' }, hass);
    vi.useFakeTimers();
    const slider = $(card, 'm3e-slider')!;
    slider.dispatchEvent(new CustomEvent('change', { detail: { value: 33.3333 }, bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(600);
    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_percentage', { percentage: 33 }, { entity_id: 'fan.living' });
  });

  it('m3e-vacuum-card: parses numeric string segment ids and drops empty ones', async () => {
    const hass = mockHass([ent('vacuum.robot', 'docked')]);
    const card = await mount(
      'm3e-vacuum-card',
      {
        entity: 'vacuum.robot',
        rooms: [
          { name: 'リビング', segment: '16', selected: true },
          { name: '廊下', segment: '', selected: true },
        ],
      },
      hass,
    );
    const startBtn = $$(card, 'button.act')[0];
    startBtn.click();
    await settle(card);
    expect(hass.callService).toHaveBeenCalledWith(
      'vacuum',
      'send_command',
      { command: 'app_segment_clean', params: [16] },
      { entity_id: 'vacuum.robot' },
    );
  });

  it('m3e-base-card: shows missing alert after empty initial states and skips 250ms lag when double_tap is none', async () => {
    const hass = mockHass([]);
    const card = await mount('m3e-tile-card', { entity: 'light.missing', double_tap_action: { action: 'none' } }, hass);
    expect($(card, '.m3e-missing')).toBeNull();

    // Populate states without light.missing.
    card.hass = mockHass([ent('light.other', 'on')]);
    await card.updateComplete;
    expect(text($(card, '.m3e-missing'))).toContain('light.missing');

    // Immediate tap when double_tap_action is 'none'.
    const presentHass = mockHass([ent('light.desk', 'off')]);
    const tileCard = await mount('m3e-tile-card', { entity: 'light.desk', double_tap_action: { action: 'none' } }, presentHass);
    vi.useFakeTimers();
    const tile = $(tileCard, '.card')!;
    tile.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
    tile.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1, bubbles: true }));
    expect(presentHass.callService).toHaveBeenCalledTimes(1);
  });
});
