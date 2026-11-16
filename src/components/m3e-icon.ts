import { LitElement, css, html, nothing, svg, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { ICONS as DESIGN_ICONS } from '../icons/icon-data';
import { EXTRA_ICONS } from '../icons/extra-icons';

/** The design's glyphs, then the extra Material Symbols (the design's win on a clash). */
const ICONS = { ...EXTRA_ICONS, ...DESIGN_ICONS };
import { SPRINGS, springTransition } from '../motion/spring';
import { define } from './define';

/** Resolve "m3:name", "name" or "mdi:name" to a bundled glyph key, if any. */
export function glyphKey(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  if (icon.startsWith('m3:')) return ICONS[icon.slice(3)] ? icon.slice(3) : undefined;
  if (icon.startsWith('mdi:')) return ICONS[`mdi-${icon.slice(4)}`] ? `mdi-${icon.slice(4)}` : undefined;
  return ICONS[icon] ? icon : undefined;
}

/**
 * Icon from the design's bundled set (Material Symbols Rounded + a few MDI),
 * falling back to HA's <ha-icon> for any other "mdi:" / "hass:" icon.
 * Changing the icon pops the new glyph in on a fast spatial spring.
 */
export class M3eIcon extends LitElement {
  @property() icon = '';

  static override styles = css`
    :host {
      display: inline-flex;
      flex: none;
      width: var(--m3e-icon-size, 24px);
      height: var(--m3e-icon-size, 24px);
      color: inherit;
      --mdc-icon-size: var(--m3e-icon-size, 24px);
    }
    svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
      display: block;
    }
  `;

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('icon') && changed.get('icon') !== undefined) {
      const t = springTransition(SPRINGS.spatialFast);
      this.renderRoot.firstElementChild?.animate(
        [
          { transform: 'scale(0.4) rotate(-30deg)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: t.duration, easing: t.easing },
      );
    }
  }

  protected override render() {
    const key = glyphKey(this.icon);
    if (key) {
      const g = ICONS[key];
      return g.vb
        ? html`<svg viewBox=${g.vb} aria-hidden="true">${svg`<path d=${g.d}></path>`}</svg>`
        : html`<svg viewBox="0 0 24 24" aria-hidden="true">${svg`<path transform="translate(${g.dx} ${g.dy})" d=${g.d}></path>`}</svg>`;
    }
    if (!this.icon) return nothing;
    return html`<ha-icon .icon=${this.icon}></ha-icon>`;
  }
}

define('m3e-icon', M3eIcon);
