import { css, html, nothing } from 'lit';
import { M3eBaseCard, type BaseCardConfig } from './base-card';
import type { LovelaceGridOptions } from '../ha/types';
import { formatSensor } from '../ha/format';
import { summaryEntities, summaryText, type Summary } from '../ha/summary';
import { define } from '../components/define';
import '../components/m3e-icon';

export interface HeadingCardConfig extends BaseCardConfig {
  title: string;
  icon?: string;
  /** Sensors shown on the right, joined by " · " (e.g. temperature, humidity). `{entity, name}` adds a label: "浴室 24.5°". */
  entities?: (string | { entity: string; name?: string })[];
  /** Static text on the right instead of entities. */
  meta?: string;
  /** Live summary on the right, e.g. { type: count, entities: [...], state: open, text: '{n}か所が開', zero_text: すべて閉 }. */
  summary?: Summary;
  /** Opens more-info for the first entity, or navigates here when tapped. */
  navigation_path?: string;
}

export { formatSensor };

/** Section heading: icon, title and a quiet line of readings on the right. */
export class M3eHeadingCard extends M3eBaseCard<HeadingCardConfig> {
  static override accentHint = '見出しのアイコンの色を変えます。';

  static override styles = [
    M3eBaseCard.styles,
    css`
      /* The heading fills its grid row and sits on the row's bottom edge, so it
         reads with the cards below it rather than the section above. */
      :host {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 100%;
      }
      .heading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 4px 4px;
        min-height: 36px;
      }
      m3e-icon {
        color: var(--m3-on-surface-variant);
      }
      :host([data-accent]) m3e-icon {
        color: var(--accent-fill);
      }
      .title {
        flex: 1;
        min-width: 0;
        font: 500 18px / 26px var(--m3e-font-plain);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta {
        font: 500 15px / 22px var(--m3e-font-brand);
        color: var(--m3-on-surface-variant);
        white-space: pre;
        font-variant-numeric: tabular-nums;
      }
      .link {
        cursor: pointer;
      }

      /* ---- compact density (phones and tablets) ---- */
      :host([compact]) .heading {
        padding: 4px 4px 0;
        min-height: 32px;
      }
      :host([compact]) m3e-icon {
        --m3e-icon-size: 20px;
      }
      :host([compact]) .title {
        font: 500 16px / 24px var(--m3e-font-plain);
      }
      :host([compact]) .meta {
        font: 500 13px / 20px var(--m3e-font-brand);
      }
    `,
  ];

  static getStubConfig() {
    return { type: 'custom:m3e-heading-card', title: 'リビング', icon: 'chair' };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', required: true, selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'entities', selector: { entity: { multiple: true, domain: 'sensor' } } },
        { name: 'meta', selector: { text: {} } },
        { name: 'navigation_path', selector: { text: {} } },
      ],
    };
  }

  protected normalizeConfig(config: HeadingCardConfig): HeadingCardConfig {
    if (!config.title) throw new Error('title is required');
    return config;
  }

  private entityIds(): string[] {
    return (this.config.entities ?? []).map((e) => (typeof e === 'string' ? e : e.entity));
  }

  protected watchedEntities(): string[] {
    return [...this.entityIds(), ...(this.config.summary ? summaryEntities(this.hass, this.config.summary) : [])];
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 'full', rows: 'auto' };
  }

  override getCardSize(): number {
    return 1;
  }

  private tap(): void {
    if (this.config.navigation_path) {
      history.pushState(null, '', this.config.navigation_path);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    } else if (this.entityIds().length) {
      this.moreInfo(this.entityIds()[0]);
    }
  }

  protected override render() {
    const readings = (this.config.entities ?? []).map((e) =>
      typeof e === 'string' ? formatSensor(this.stateObj(e)) : `${e.name ? `${e.name} ` : ''}${formatSensor(this.stateObj(e.entity))}`,
    );
    const meta = this.config.meta ?? (this.config.summary ? summaryText(this.hass, this.config.summary) : readings.join('  ·  '));
    const linked = !!(this.config.navigation_path || this.config.entities?.length);
    return html`<div class="heading ${linked ? 'link' : ''}" @click=${linked ? this.tap : nothing}>
      ${this.config.icon ? html`<m3e-icon .icon=${this.config.icon}></m3e-icon>` : nothing}
      <span class="title" role="heading" aria-level="2">${this.config.title}</span>
      ${meta ? html`<span class="meta">${meta}</span>` : nothing}
    </div>`;
  }
}

define('m3e-heading-card', M3eHeadingCard);
