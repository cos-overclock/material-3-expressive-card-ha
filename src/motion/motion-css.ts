import { css, unsafeCSS } from 'lit';
import { SPRINGS, springTransition, type SpringToken } from './spring';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const decls = (Object.keys(SPRINGS) as SpringToken[])
  .map((name) => `--m3e-${kebab(name)}: ${springTransition(SPRINGS[name]).timing};`)
  .join('\n');

/**
 * Spring timings as custom properties, usable in any transition:
 *   transition: transform var(--m3e-spatial-fast), background-color var(--m3e-effects-default);
 */
export const motionTokens = css`
  :host {
    ${unsafeCSS(decls)}
  }
  @media (prefers-reduced-motion: reduce) {
    :host {
      --m3e-spatial-fast: 0ms linear;
      --m3e-spatial-default: 0ms linear;
      --m3e-spatial-slow: 0ms linear;
      --m3e-effects-fast: 0ms linear;
      --m3e-effects-default: 0ms linear;
      --m3e-effects-slow: 0ms linear;
    }
  }
`;
