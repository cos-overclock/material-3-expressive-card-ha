/** The slice of Home Assistant's frontend API the cards use. */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export type HassEntities = Record<string, HassEntity>;

export interface HassServiceTarget {
  entity_id?: string | string[];
}

export interface HomeAssistant {
  states: HassEntities;
  themes?: { darkMode?: boolean; theme?: string };
  /** Entity / device / area registries (HA 2023.x+ frontend). */
  entities?: Record<string, { entity_id: string; area_id?: string | null; device_id?: string | null }>;
  devices?: Record<string, { id: string; area_id?: string | null }>;
  areas?: Record<string, { area_id: string; name: string }>;
  locale?: { language: string };
  language?: string;
  callService(domain: string, service: string, data?: Record<string, unknown>, target?: HassServiceTarget): Promise<unknown>;
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  /** REST API, e.g. callApi('GET', 'calendars/calendar.family?start=…&end=…'). */
  callApi?<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: Record<string, unknown>): Promise<T>;
  connection?: {
    subscribeMessage<T>(callback: (msg: T) => void, msg: Record<string, unknown>): Promise<() => void>;
  };
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceGridOptions {
  columns?: number | 'full';
  rows?: number | 'auto';
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

export type ActionType = 'toggle' | 'more-info' | 'none';

export interface ActionsConfig {
  tap_action?: { action: ActionType };
  hold_action?: { action: ActionType };
}
