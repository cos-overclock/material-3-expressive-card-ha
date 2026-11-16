import { LitElement, css, html, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { SPRINGS, springTransition, prefersReducedMotion } from '../motion/spring';
import { define } from './define';

/**
 * Text that rolls when it changes: the old value slides out and the new one
 * slides in on the fast spatial spring. Direction follows the numeric change
 * (up for larger, down for smaller), like a counter. Typography is inherited.
 */
export class M3eRollingText extends LitElement {
  @property() text = '';

  private previous = '';

  static override styles = css`
    :host {
      display: inline-grid;
      overflow: hidden;
      vertical-align: bottom;
    }
    span {
      grid-area: 1 / 1;
      white-space: nowrap;
    }
  `;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('text')) this.previous = (changed.get('text') as string | undefined) ?? '';
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('text') || !this.previous || this.previous === this.text || prefersReducedMotion()) return;
    const [outgoing, incoming] = this.renderRoot.querySelectorAll('span');
    const a = parseFloat(this.previous.replace(/[^\d.-]/g, ''));
    const b = parseFloat(this.text.replace(/[^\d.-]/g, ''));
    const dir = Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1;
    const t = springTransition(SPRINGS.spatialFast);
    const opts = { duration: t.duration, easing: t.easing, fill: 'both' as const };
    outgoing.animate(
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${-dir * 70}%)`, opacity: 0 },
      ],
      opts,
    );
    const anim = incoming.animate(
      [
        { transform: `translateY(${dir * 70}%)`, opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      opts,
    );
    // Drop the outgoing text afterwards so it stops taking up width.
    const settled = this.text;
    anim.onfinish = () => {
      if (this.text !== settled) return;
      this.previous = '';
      this.requestUpdate();
    };
  }

  protected override render() {
    return html`<span aria-hidden="true">${this.previous}</span><span>${this.text}</span>`;
  }
}

define('m3e-rolling-text', M3eRollingText);
