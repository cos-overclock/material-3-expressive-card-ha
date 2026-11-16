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
  device_id?: string | string[];
  area_id?: string | string[];
}

export interface HomeAssistant {
  states: HassEntities;
  themes?: { darkMode?: boolean; theme?: string };
  /** Entity / device / area registries (HA 2023.x+ frontend). */
  entities?: Record<
    string,
    { entity_id: string; area_id?: string | null; device_id?: string | null; display_precision?: number; hidden?: boolean; entity_category?: string | null }
  >;
  devices?: Record<string, { id: string; area_id?: string | null }>;
  areas?: Record<string, { area_id: string; name: string; icon?: string | null }>;
  locale?: { language: string };
  user?: { id: string; name: string; is_admin?: boolean };
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

/** Every action HA's frontend understands (`hass-action`). */
export type ActionType =
  | 'toggle'
  | 'more-info'
  | 'none'
  | 'navigate'
  | 'url'
  | 'perform-action'
  | 'call-service'
  | 'assist'
  | 'fire-dom-event';

/** A Lovelace action, as written under tap_action / hold_action / double_tap_action. */
export interface ActionConfig {
  action: ActionType;
  /** more-info: open this entity instead of the card's. */
  entity?: string;
  navigation_path?: string;
  navigation_replace?: boolean;
  url_path?: string;
  perform_action?: string;
  /** Pre-2024.8 name of perform_action. */
  service?: string;
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
  target?: HassServiceTarget;
  pipeline_id?: string;
  start_listening?: boolean;
  /** Ask before running (HA shows its confirmation dialog). */
  confirmation?: boolean | { text?: string; exemptions?: { user: string }[] };
  [key: string]: unknown;
}

export interface ActionsConfig {
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

/** HA's `haptic` event values (the companion apps vibrate on them). */
export type HapticType = 'success' | 'warning' | 'failure' | 'light' | 'medium' | 'heavy' | 'selection';
