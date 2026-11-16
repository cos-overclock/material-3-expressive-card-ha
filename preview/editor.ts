import '../src/index';
import { MockHass } from './mock-hass';
import type { HomeAssistant } from '../src/ha/types';

type CardEl = HTMLElement & { setConfig(c: Record<string, unknown>): void; hass?: HomeAssistant };
type CardClass = { getConfigElement(): HTMLElement & { setConfig(c: Record<string, unknown>): void; hass?: unknown } };

/**
 * HA's card editor dialog, minus HA: each row pairs a card with its
 * getConfigElement() editor. ha-form only exists inside HA, so only the
 * accent picker shows here; picking a swatch re-configures the card the
 * way HA's dialog would on `config-changed`.
 */
const SAMPLES: Record<string, unknown>[] = [
  { type: 'custom:m3e-cover-card', entity: 'cover.living_curtain', color: 'sapphire' },
  { type: 'custom:m3e-cover-card', entity: 'cover.bedroom_screen', layout: 'compact', color: 'maroon' },
  { type: 'custom:m3e-sensor-card', entity: 'sensor.living_temperature', name: 'リビングの室温', color: 'flamingo' },
  { type: 'custom:m3e-tile-card', entity: 'switch.living_tv', icon: 'tv', color: 'rosewater' },
  { type: 'custom:m3e-heading-card', title: 'リビング', icon: 'chair', entities: ['sensor.living_temperature'], color: 'mauve' },
  { type: 'custom:m3e-alarm-card', entity: 'alarm_control_panel.home', color: 'sapphire' },
  {
    type: 'custom:m3e-scenes-card',
    color: 'teal',
    scenes: [{ entity: 'scene.good_morning', color: 'peach' }, { entity: 'scene.going_out' }, { entity: 'scene.theater' }],
  },
  { type: 'custom:m3e-presence-card', people: ['person.yuki', 'person.misaki', 'person.sora'], color: 'lavender' },
  { type: 'custom:m3e-energy-flow-card', battery_entity: 'sensor.battery_level', color: 'sky' },
  // Coloured by itself: the editor has no swatches.
  { type: 'custom:m3e-climate-card', entity: 'climate.living_ac' },
];

const hass = new MockHass();
const root = document.getElementById('rows')!;
const cards: (CardEl | { hass?: unknown })[] = [];

for (const sample of SAMPLES) {
  const tag = String(sample.type).replace('custom:', '');
  const row = document.createElement('div');
  row.className = 'row';
  const card = document.createElement(tag) as CardEl;
  card.setConfig(sample);
  const editor = (customElements.get(tag) as unknown as CardClass).getConfigElement();
  editor.setConfig(sample);
  editor.addEventListener('config-changed', (e) => {
    const config = (e as CustomEvent<{ config: Record<string, unknown> }>).detail.config;
    card.setConfig(config);
    editor.setConfig(config);
  });
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<code>${tag}</code>`;
  panel.appendChild(editor);
  row.append(card, panel);
  root.appendChild(row);
  cards.push(card, editor);
}

hass.subscribe((h) => cards.forEach((c) => (c.hass = h)));

const themeBtn = document.getElementById('theme') as HTMLButtonElement;
function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'mocha' : 'latte';
  themeBtn.textContent = dark ? 'Mocha (Dark)' : 'Latte (Light)';
  hass.setDarkMode(dark);
}
applyTheme(new URLSearchParams(location.search).get('theme') === 'mocha');
themeBtn.addEventListener('click', () => applyTheme(!hass.darkMode));
