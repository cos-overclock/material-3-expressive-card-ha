// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/cards/heading-card';
import { $, ent, key, mockHass, mount, settle, text, withState } from '../helpers/dom';

(window as unknown as { M3E_CARDS_FONTS?: string }).M3E_CARDS_FONTS = 'none';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

function buildSection() {
  const container = document.createElement('div');
  container.className = 'container';
  document.body.appendChild(container);
  const c1 = document.createElement('div');
  c1.textContent = 'Card 1';
  const c2 = document.createElement('div');
  c2.textContent = 'Card 2';
  const nextHeading = document.createElement('m3e-heading-card') as HTMLElement & { setConfig(c: object): void; hass: unknown };
  nextHeading.setConfig({ type: 'custom:m3e-heading-card', title: 'Next' });
  const c3 = document.createElement('div');
  c3.textContent = 'Card 3';
  return { container, c1, c2, nextHeading, c3 };
}

describe('m3e-heading-card collapsible & quick action', () => {
  it('collapses siblings up to the next heading, persists to storage, and restores on expand/disconnect', async () => {
    const hass = mockHass([]);
    const { container, c1, c2, nextHeading, c3 } = buildSection();
    nextHeading.hass = hass;

    const heading = document.createElement('m3e-heading-card') as HTMLElement & { setConfig(c: object): void; hass: unknown; updateComplete: Promise<boolean> };
    heading.setConfig({ type: 'custom:m3e-heading-card', title: '照明', collapsible: true });
    heading.hass = hass;

    container.append(heading, c1, c2, nextHeading, c3);
    await settle(heading);

    const row = $(heading, '.heading')!;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(c1.style.display).toBe('');

    row.click();
    await heading.updateComplete;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(c1.style.display).toBe('none');
    expect(c2.style.display).toBe('none');
    expect(nextHeading.style.display).toBe('');
    expect(c3.style.display).toBe('');

    // Re-mounting restores collapsed state from localStorage.
    heading.remove();
    expect(c1.style.display).toBe('');

    const heading2 = document.createElement('m3e-heading-card') as HTMLElement & { setConfig(c: object): void; hass: unknown; updateComplete: Promise<boolean> };
    heading2.setConfig({ type: 'custom:m3e-heading-card', title: '照明', collapsible: true });
    heading2.hass = hass;
    container.prepend(heading2);
    await settle(heading2);
    expect($(heading2, '.heading')?.getAttribute('aria-expanded')).toBe('false');
    expect(c1.style.display).toBe('none');

    // Keyboard toggle expands again.
    key($(heading2, '.heading')!, 'Enter');
    await heading2.updateComplete;
    expect(c1.style.display).toBe('');
  });

  it('syncs with collapse_entity, skips collapse in editMode, and triggers quick action without collapsing', async () => {
    let hass = mockHass([ent('input_boolean.fold', 'off'), ent('light.a', 'on')]);
    const { container, c1 } = buildSection();
    const heading = document.createElement('m3e-heading-card') as HTMLElement & {
      setConfig(c: object): void;
      hass: unknown;
      editMode?: boolean;
      updateComplete: Promise<boolean>;
    };
    heading.setConfig({
      type: 'custom:m3e-heading-card',
      title: '照明',
      collapsible: true,
      collapse_entity: 'input_boolean.fold',
      action: { name: '全消灯', icon: 'power-settings-new', tap_action: { action: 'perform-action', perform_action: 'light.turn_off' } },
    });
    heading.hass = hass;
    container.append(heading, c1);
    await settle(heading);

    // Quick action fires hass-action without toggling collapse.
    const actions: unknown[] = [];
    heading.addEventListener('hass-action', (e) => actions.push((e as CustomEvent).detail));
    const actBtn = $(heading, 'button.action-btn')!;
    expect(text(actBtn)).toBe('全消灯');
    actBtn.click();
    await heading.updateComplete;
    expect(actions.length).toBe(1);
    expect(c1.style.display).toBe('');
    expect(hass.callService).not.toHaveBeenCalled();

    // Toggling heading calls homeassistant.turn_on on collapse_entity.
    $(heading, '.heading')!.click();
    await settle(heading);
    expect(hass.callService).toHaveBeenCalledWith('homeassistant', 'turn_on', {}, { entity_id: 'input_boolean.fold' });

    // External state change collapses siblings; editMode reveals them.
    hass = withState(hass, ent('input_boolean.fold', 'on'));
    heading.hass = hass;
    await heading.updateComplete;
    expect(c1.style.display).toBe('none');

    heading.editMode = true;
    heading.setConfig({ type: 'custom:m3e-heading-card', title: '照明', collapsible: true, collapse_entity: 'input_boolean.fold' });
    await heading.updateComplete;
    expect(c1.style.display).toBe('');
  });

  it('gracefully hides chevron outside a section/column/container', async () => {
    const hass = mockHass([]);
    const heading = await mount('m3e-heading-card', { title: '単独', collapsible: true }, hass);
    expect($(heading, '.chevron')).toBeNull();
  });
});
