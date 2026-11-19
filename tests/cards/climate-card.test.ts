// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/climate-card';
import { resolveClimateActivity } from '../../src/cards/climate-card';
import { $, ent, mockHass, mount, withState } from '../helpers/dom';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('climate-card hvac_action visual distinction', () => {
  it('resolves accent, active, and running across modes and hvac_action states', () => {
    expect(resolveClimateActivity('off', 'off', false)).toEqual({ accent: 'neutral', active: false, running: false });
    expect(resolveClimateActivity('heat', 'heating', true)).toEqual({ accent: 'neutral', active: false, running: false });
    expect(resolveClimateActivity('heat_cool', 'heating', false)).toEqual({ accent: 'peach', active: true, running: true, actionAccent: 'peach' });
    expect(resolveClimateActivity('heat_cool', 'cooling', false)).toEqual({ accent: 'blue', active: true, running: true, actionAccent: 'blue' });
    expect(resolveClimateActivity('heat', 'idle', false)).toEqual({ accent: 'peach', active: true, running: false, actionAccent: 'peach' });
    expect(resolveClimateActivity('heat_cool', 'idle', false)).toEqual({ accent: 'lavender', active: true, running: false, actionAccent: undefined });
    expect(resolveClimateActivity('cool', undefined, false)).toEqual({ accent: 'blue', active: true, running: true, actionAccent: 'blue' });
  });

  it('distinguishes running vs standby vs off vs show_activity_glow:false in the DOM', async () => {
    const hass = mockHass([
      ent('climate.ac', 'heat', {
        friendly_name: 'エアコン',
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        hvac_action: 'heating',
        temperature: 22,
        current_temperature: 20,
      }),
    ]);
    const card = await mount('m3e-climate-card', { entity: 'climate.ac' }, hass);
    const cardEl = () => $(card, '.card')!;

    expect(cardEl().classList.contains('running')).toBe(true);
    expect(cardEl().classList.contains('standby')).toBe(false);
    expect(cardEl().getAttribute('data-accent')).toBe('peach');
    expect($(card, '.activity-dot')?.classList.contains('on')).toBe(true);

    // Idle standby: dimmed standby state instead of running glow.
    card.hass = withState(
      hass,
      ent('climate.ac', 'heat', {
        friendly_name: 'エアコン',
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        hvac_action: 'idle',
        temperature: 22,
        current_temperature: 22.5,
      }),
    );
    await card.updateComplete;
    expect(cardEl().classList.contains('running')).toBe(false);
    expect(cardEl().classList.contains('standby')).toBe(true);
    expect(cardEl().classList.contains('standby-framed')).toBe(true);
    expect($(card, '.activity-dot')?.classList.contains('idle')).toBe(true);

    // heat_cool idle: standby without armed heat/cool frame.
    card.hass = withState(
      hass,
      ent('climate.ac', 'heat_cool', {
        friendly_name: 'エアコン',
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        hvac_action: 'idle',
        target_temp_low: 20,
        target_temp_high: 26,
      }),
    );
    await card.updateComplete;
    expect(cardEl().classList.contains('standby')).toBe(true);
    expect(cardEl().classList.contains('standby-framed')).toBe(false);

    // Off: neutral and no activity dot.
    card.hass = withState(hass, ent('climate.ac', 'off', { hvac_modes: ['off', 'heat', 'cool'], hvac_action: 'off' }));
    await card.updateComplete;
    expect(cardEl().classList.contains('running')).toBe(false);
    expect(cardEl().classList.contains('standby')).toBe(false);
    expect(cardEl().getAttribute('data-accent')).toBe('neutral');
    expect($(card, '.activity-dot')).toBeNull();

    // show_activity_glow: false suppresses frame classes while keeping dot.
    card.setConfig({ type: 'custom:m3e-climate-card', entity: 'climate.ac', show_activity_glow: false });
    card.hass = withState(hass, ent('climate.ac', 'cool', { hvac_modes: ['off', 'heat', 'cool'], hvac_action: 'cooling' }));
    await card.updateComplete;
    expect(cardEl().classList.contains('running')).toBe(false);
    expect($(card, '.activity-dot')?.classList.contains('on')).toBe(true);
  });
});
