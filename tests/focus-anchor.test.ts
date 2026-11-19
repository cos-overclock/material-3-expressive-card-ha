// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/cards/tile-card';
import '../src/cards/sensor-card';
import { anchorFocus, anchorTarget, deepActiveElement, installFocusAnchor, isInside, POINTER_MEMORY_MS, rememberPointer } from '../src/ha/focus-anchor';
import { $, ent, mockHass, mount, settle } from './helpers/dom';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  rememberPointer(undefined);
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('focus anchor', () => {
  it('resolves deepActiveElement and isInside across shadow roots', async () => {
    const hass = mockHass([ent('light.desk', 'off')]);
    const card = await mount('m3e-tile-card', { entity: 'light.desk' }, hass);
    const inner = $(card, '.card')!;
    expect(isInside(card, inner)).toBe(true);

    const other = document.createElement('button');
    document.body.appendChild(other);
    expect(isInside(card, other)).toBe(false);

    inner.focus();
    expect(deepActiveElement()).toBe(inner);
  });

  it('anchors focus to tapped inner element on hass-more-info with preventScroll', async () => {
    installFocusAnchor();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();

    const hass = mockHass([ent('sensor.t', '21', { device_class: 'temperature', unit_of_measurement: '°C' })]);
    hass.callWS.mockResolvedValue({ 'sensor.t': [] });
    const card = await mount('m3e-sensor-card', { entity: 'sensor.t' }, hass);
    await settle(card);

    const headerText = $(card, '.text')!;
    const focusSpy = vi.spyOn(headerText, 'focus');
    headerText.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0 }));
    headerText.click();

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(deepActiveElement()).toBe(headerText);
    expect(headerText.getAttribute('tabindex')).toBe('-1');
  });

  it('falls back to the card when remembered pointer is detached or expired', async () => {
    const hass = mockHass([ent('light.desk', 'off')]);
    const card = await mount('m3e-tile-card', { entity: 'light.desk' }, hass);
    const stale = document.createElement('span');
    rememberPointer(stale, 1000);
    // Detached element falls back to card.
    expect(anchorTarget(card, 1100)).toBe(card);

    const inner = $(card, '.card')!;
    rememberPointer(inner, 1000);
    expect(anchorTarget(card, 1000 + POINTER_MEMORY_MS)).toBe(inner);
    expect(anchorTarget(card, 1000 + POINTER_MEMORY_MS + 1)).toBe(card);
  });

  it('preserves existing keyboard focus inside the target', async () => {
    const hass = mockHass([ent('light.desk', 'off')]);
    const card = await mount('m3e-tile-card', { entity: 'light.desk' }, hass);
    const inner = $(card, '.card')!;
    inner.focus();
    const cardFocus = vi.spyOn(card, 'focus');
    anchorFocus(card);
    expect(cardFocus).not.toHaveBeenCalled();
    expect(deepActiveElement()).toBe(inner);
  });
});
