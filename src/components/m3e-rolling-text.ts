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
  private anims: Animation[] = [];

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

  private cancelAnims(): void {
    for (const a of this.anims) {
      a.finished?.catch(() => {});
      a.cancel();
    }
    this.anims = [];
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cancelAnims();
    this.previous = '';
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('text')) {
      const prev = (changed.get('text') as string | undefined) ?? '';
      this.previous = prefersReducedMotion() ? '' : prev;
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('text') || !this.previous || this.previous === this.text || prefersReducedMotion()) {
      if (this.previous) {
        this.previous = '';
        this.requestUpdate();
      }
      return;
    }
    const [outgoing, incoming] = this.renderRoot.querySelectorAll('span');
    if (typeof outgoing?.animate !== 'function' || typeof incoming?.animate !== 'function') {
      this.previous = '';
      this.requestUpdate();
      return;
    }
    this.cancelAnims();
    const a = parseFloat(this.previous.replace(/[^\d.-]/g, ''));
    const b = parseFloat(this.text.replace(/[^\d.-]/g, ''));
    const dir = Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1;
    const t = springTransition(SPRINGS.spatialFast);
    const opts = { duration: t.duration, easing: t.easing, fill: 'both' as const };
    const outAnim = outgoing.animate(
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
    this.anims = [outAnim, anim];
    // Drop the outgoing text afterwards so it stops taking up width.
    const settled = this.text;
    anim.onfinish = () => {
      this.anims = [];
      if (!this.isConnected || this.text !== settled) return;
      this.previous = '';
      this.requestUpdate();
    };
  }

  protected override render() {
    return html`<span aria-hidden="true">${this.previous}</span><span>${this.text}</span>`;
  }
}

define('m3e-rolling-text', M3eRollingText);
