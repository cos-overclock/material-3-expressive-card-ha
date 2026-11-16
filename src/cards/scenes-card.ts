import { css, html, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import { SPRINGS, springTransition } from '../motion/spring';
import { domainOf } from '../ha/helpers';
import type { LovelaceGridOptions } from '../ha/types';
import type { Accent } from '../theme/tokens';
import { define } from '../components/define';
import '../components/m3e-icon';

interface SceneItem {
  entity: string;
  name?: string;
  icon?: string;
  color?: Accent;
}

export interface ScenesCardConfig extends BaseCardConfig {
  title?: string;
  scenes: SceneItem[];
  /** Hours a scene stays highlighted after activation (default 12). */
  active_hours?: number;
}

const DEFAULT_COLORS: Accent[] = ['peach', 'teal', 'mauve', 'lavender', 'blue', 'green'];

/**
 * Row of scene buttons. The most recently activated scene (scene state is its
 * activation time) is filled with its accent colour.
 *
 * Motion: a pressed button widens and rounds (12 → 28px) while its
 * neighbours give way; activating a scene cross-fades its fill and bounces the
 * icon on the fast spatial spring.
 */
export class M3eScenesCard extends M3eBaseCard<ScenesCardConfig> {
  static override accentHint = '色を指定していないシーンの色を変えます。';

  @state() private pressed = '';
  @state() private optimistic?: { entity: string; at: number };

  static override styles = [
    M3eBaseCard.styles,
    css`
      .card {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      .row {
        display: flex;
        gap: 8px;
      }
      button {
        all: unset;
        box-sizing: border-box;
        flex: 1 1 0;
        min-width: 0;
        height: 88px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: var(--m3-surface-high);
        color: var(--m3-on-surface);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition:
          flex-grow var(--m3e-spatial-fast),
          border-radius var(--m3e-spatial-fast),
          background-color var(--m3e-effects-default),
          color var(--m3e-effects-default);
      }
      button:focus-visible {
        outline: 2px solid var(--accent-fill);
        outline-offset: 2px;
      }
      button.pressed {
        flex-grow: 1.35;
        border-radius: 28px;
      }
      button m3e-icon {
        --m3e-icon-size: 28px;
        color: var(--accent-fill);
        transition: color var(--m3e-effects-default);
      }
      button.active {
        background: var(--accent-fill);
        color: var(--accent-on-fill);
      }
      button.active m3e-icon {
        color: var(--accent-on-fill);
      }
      .label {
        font: 500 13px / 18px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        padding: 0 4px;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .card {
        padding: 12px;
        gap: 8px;
      }
      :host([compact]) .title {
        font: 500 14px / 20px var(--m3e-font-plain);
        padding-left: 4px;
      }
      :host([compact]) .row {
        gap: 6px;
      }
      :host([compact]) button {
        height: 64px;
        gap: 4px;
      }
      :host([compact]) button m3e-icon {
        --m3e-icon-size: 24px;
      }
      :host([compact]) .label {
        font: 500 12px / 16px var(--m3e-font-plain);
      }
    `,
  ];

  static getStubConfig(hass: { states: Record<string, unknown> }) {
    const scenes = Object.keys(hass.states)
      .filter((id) => id.startsWith('scene.'))
      .slice(0, 4)
      .map((entity) => ({ entity }));
    return { type: 'custom:m3e-scenes-card', title: 'シーン', scenes };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'scenes', selector: { object: {} } },
      ],
    };
  }

  protected normalizeConfig(config: ScenesCardConfig): ScenesCardConfig {
    if (!Array.isArray(config.scenes) || !config.scenes.length) throw new Error('scenes: list at least one scene');
    return {
      ...config,
      scenes: config.scenes.map((s) => (typeof s === 'string' ? { entity: s } : s)),
    };
  }

  protected watchedEntities(): string[] {
    return this.config.scenes.map((s) => s.entity);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private activeEntity(): string | undefined {
    const horizon = (this.config.active_hours ?? 12) * 3600_000;
    let best: { entity: string; at: number } | undefined = this.optimistic;
    for (const item of this.config.scenes) {
      const s = this.stateObj(item.entity);
      if (!s) continue;
      // scene: state is the activation timestamp; script: last_changed when it ran.
      const at = Date.parse(domainOf(item.entity) === 'scene' ? s.state : s.last_changed);
      if (Number.isFinite(at) && (!best || at > best.at)) best = { entity: item.entity, at };
    }
    return best && Date.now() - best.at < horizon ? best.entity : undefined;
  }

  private activate(item: SceneItem): void {
    const domain = domainOf(item.entity);
    const service = domain === 'scene' || domain === 'script' ? 'turn_on' : 'toggle';
    this.call(domain === 'scene' || domain === 'script' ? domain : 'homeassistant', service, {}, item.entity);
    this.optimistic = { entity: item.entity, at: Date.now() };
  }

  private lastActive?: string;

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const active = this.activeEntity();
    if (active && this.lastActive !== undefined && active !== this.lastActive) {
      const icon = this.renderRoot.querySelector(`button[data-entity="${active}"] m3e-icon`);
      const t = springTransition(SPRINGS.spatialFast);
      icon?.animate([{ transform: 'scale(1.35) rotate(-12deg)' }, { transform: 'none' }], { duration: t.duration, easing: t.easing });
    }
    this.lastActive = active ?? '';
  }

  protected override render() {
    const active = this.activeEntity();
    return html`<div class="card">
      ${this.config.title !== '' ? html`<p class="title">${this.config.title ?? 'シーン'}</p>` : ''}
      <div class="row">
        ${repeat(
          this.config.scenes,
          (s) => s.entity,
          (item, i) => {
            const s = this.stateObj(item.entity);
            const name = item.name ?? (s?.attributes.friendly_name as string) ?? item.entity;
            const icon = item.icon ?? (s?.attributes.icon as string) ?? 'wb-twilight';
            return html`<button
              data-entity=${item.entity}
              data-accent=${item.color ?? this.config.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              class="${item.entity === active ? 'active' : ''} ${this.pressed === item.entity ? 'pressed' : ''}"
              aria-pressed=${item.entity === active ? 'true' : 'false'}
              @click=${() => this.activate(item)}
              @pointerdown=${() => (this.pressed = item.entity)}
              @pointerup=${() => (this.pressed = '')}
              @pointerleave=${() => (this.pressed = '')}
              @pointercancel=${() => (this.pressed = '')}
            >
              <m3e-icon .icon=${icon}></m3e-icon>
              <span class="label">${name}</span>
            </button>`;
          },
        )}
      </div>
    </div>`;
  }
}

define('m3e-scenes-card', M3eScenesCard);
