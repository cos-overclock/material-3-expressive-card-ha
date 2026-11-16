/**
 * Japanese display labels used by the design. Config can override any of
 * them; unknown values fall back to the raw HA value.
 */

export const HVAC_LABEL: Record<string, string> = {
  heat: '暖房',
  cool: '冷房',
  dry: '除湿',
  fan_only: '送風',
  auto: '自動',
  heat_cool: '自動',
  off: '停止',
};

export const HVAC_ACTION_LABEL: Record<string, string> = {
  heat: '暖房中',
  cool: '冷房中',
  dry: '除湿中',
  fan_only: '送風中',
  auto: '自動運転中',
  heat_cool: '自動運転中',
  off: '停止中',
};

export const FAN_LABEL: Record<string, string> = {
  auto: '自動',
  quiet: '静か',
  silent: '静か',
  low: '弱',
  medium: '中',
  middle: '中',
  high: '強',
  strong: '強',
  turbo: 'パワフル',
  on_low: '弱',
  on_medium: '中',
  on_high: '強',
  auto_low: '自動（弱）',
  auto_medium: '自動（中）',
  auto_high: '自動（強）',
  on: 'オン',
  off: 'オフ',
};

export const SWING_LABEL: Record<string, string> = {
  on: 'スイング',
  swing: 'スイング',
  both: 'スイング',
  vertical: 'スイング',
  horizontal: 'スイング',
  auto: '自動',
  off: '固定',
  left: '左',
  left_center: '左寄り',
  center: '中央',
  middle: '中央',
  right_center: '右寄り',
  right: '右',
  wide: 'ワイド',
};

export const WEATHER_LABEL: Record<string, string> = {
  'clear-night': '晴れ',
  cloudy: 'くもり',
  exceptional: '警報',
  fog: '霧',
  hail: 'ひょう',
  lightning: '雷',
  'lightning-rainy': '雷雨',
  partlycloudy: 'くもり時々晴れ',
  pouring: '大雨',
  rainy: '雨',
  snowy: '雪',
  'snowy-rainy': 'みぞれ',
  sunny: '晴れ',
  windy: '強風',
  'windy-variant': '強風',
};

/** Weather condition → [icon, accent used for the forecast glyph]. */
export const WEATHER_ICON: Record<string, [string, string]> = {
  'clear-night': ['nights-stay', 'lavender'],
  cloudy: ['cloud', 'neutral'],
  fog: ['cloud', 'neutral'],
  hail: ['rainy', 'blue'],
  lightning: ['bolt', 'yellow'],
  'lightning-rainy': ['rainy', 'blue'],
  partlycloudy: ['partly-cloudy-day', 'blue'],
  pouring: ['rainy', 'blue'],
  rainy: ['rainy', 'blue'],
  snowy: ['ac-unit', 'sky'],
  'snowy-rainy': ['rainy', 'sky'],
  sunny: ['sunny', 'yellow'],
  windy: ['air', 'teal'],
  'windy-variant': ['air', 'teal'],
  exceptional: ['notifications-active', 'red'],
};

export const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export const label = (table: Record<string, string>, value: string | undefined, overrides?: Record<string, string>) =>
  value === undefined ? '' : (overrides?.[value] ?? table[value] ?? value);
