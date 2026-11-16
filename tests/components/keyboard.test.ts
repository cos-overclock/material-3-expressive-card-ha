// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/components/m3e-slider';
import '../../src/cards/tile-card';
import type { M3eSlider } from '../../src/components/m3e-slider';
import { $, ent, key, mockHass, mount, settle } from '../helpers/dom';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m3e-slider keyboard', () => {
  async function slider(attrs: Partial<M3eSlider> = {}) {
    const el = document.createElement('m3e-slider') as M3eSlider;
    Object.assign(el, { min: 0, max: 100, step: 5, value: 50 }, attrs);
    document.body.appendChild(el);
    await el.updateComplete;
    const changes: number[] = [];
    el.addEventListener('change', (e) => changes.push((e as CustomEvent<{ value: number }>).detail.value));
    return { el, changes };
  }

  it('moves by step, by a tenth, and to the ends', async () => {
    const { el, changes } = await slider();
    key(el, 'ArrowRight');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'PageUp');
    key(el, 'End');
    key(el, 'ArrowUp');
    key(el, 'Home');
    expect(changes).toEqual([55, 50, 45, 55, 100, 100, 0]);
    expect(el.getAttribute('role')).toBe('slider');
    expect(el.tabIndex).toBe(0);
  });

  it('ignores keys and leaves the tab order while disabled', async () => {
    const { el, changes } = await slider({ disabled: true });
    key(el, 'ArrowRight');
    expect(changes).toEqual([]);
    expect(el.tabIndex).toBe(-1);
    expect(el.getAttribute('aria-disabled')).toBe('true');
    el.disabled = false;
    await el.updateComplete;
    key(el, 'ArrowRight');
    expect(changes).toEqual([55]);
    expect(el.tabIndex).toBe(0);
  });
});

describe('PressGesture keyboard (tile card)', () => {
  it('Enter / Space tap; Shift+Enter and the context-menu key hold', async () => {
    const hass = mockHass([ent('light.desk', 'off', { friendly_name: 'デスク' })]);
    const card = await mount('m3e-tile-card', { entity: 'light.desk' }, hass);
    const tile = $(card, '.card')!;
    const moreInfo: string[] = [];
    card.addEventListener('hass-more-info', (e) => moreInfo.push((e as CustomEvent<{ entityId: string }>).detail.entityId));

    key(tile, 'Enter');
    key(tile, ' ');
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(hass.callService.mock.calls[0].slice(0, 2)).toEqual(['light', 'turn_on']);

    key(tile, 'Enter', { shiftKey: true });
    key(tile, 'ContextMenu');
    expect(moreInfo).toEqual(['light.desk', 'light.desk']);
    expect(hass.callService).toHaveBeenCalledTimes(2);
  });

  it('ignores keys bubbling up from a control inside the tile', async () => {
    const hass = mockHass([ent('light.desk', 'on')]);
    const card = await mount('m3e-tile-card', { entity: 'light.desk' }, hass);
    const tile = $(card, '.card')!;
    const inner = tile.querySelector('m3e-shape')!;
    key(inner, 'Enter');
    await settle(card);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});
