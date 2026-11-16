import '../src/index';
import { COMPACT_QUERY } from '../src/cards/base-card';
import { MockHass } from './mock-hass';
import type { HomeAssistant, LovelaceGridOptions } from '../src/ha/types';

type CardEl = HTMLElement & {
  setConfig(c: Record<string, unknown>): void;
  hass?: HomeAssistant;
  getGridOptions?(): LovelaceGridOptions;
};

/** The design's sections, written as Lovelace YAML would be. */
const SECTIONS: Record<string, unknown>[][] = [
  [
    { type: 'custom:m3e-hero-card', weather: 'weather.home', subtitle: '玄関は施錠済み・窓はすべて閉' },
    {
      type: 'custom:m3e-scenes-card',
      scenes: [
        { entity: 'scene.good_morning', icon: 'wb-twilight', color: 'peach' },
        { entity: 'scene.going_out', icon: 'door-front', color: 'teal' },
        { entity: 'scene.theater', icon: 'tv', color: 'mauve' },
        { entity: 'scene.good_night', icon: 'nights-stay', color: 'lavender' },
      ],
    },
    { type: 'custom:m3e-heading-card', title: '書斎', icon: 'desk' },
    // auto → full: this light supports both rgb and color_temp
    { type: 'custom:m3e-light-card', entity: 'light.study_desk', layout: 'auto' },
    // Fan speed and vanes through separate entities, each with its own auto / manual switch.
    {
      type: 'custom:m3e-climate-card',
      entity: 'climate.study_ac',
      expanded: true,
      fan_mode_entity: 'select.study_ac_fan_speed',
      fan_auto_entity: 'switch.study_ac_fan_auto',
      swing_mode_entity: 'select.study_ac_vane_vertical',
      swing_auto_entity: 'select.study_ac_vane_mode',
      // A slider with the off-scale option (スイング) as a button beside it.
      swing_control: 'slider',
      swing_horizontal_mode_entity: 'number.study_ac_vane_horizontal',
      swing_horizontal_auto_entity: 'input_boolean.study_ac_vane_horizontal_auto',
    },
  ],
  [
    { type: 'custom:m3e-heading-card', title: 'リビング', icon: 'chair', entities: ['sensor.living_temperature', 'sensor.living_humidity'] },
    { type: 'custom:m3e-light-card', entity: 'light.living_ceiling' },
    { type: 'custom:m3e-tile-card', entity: 'light.living_indirect', icon: 'light-group' },
    { type: 'custom:m3e-tile-card', entity: 'light.living_floor', icon: 'floor-lamp' },
    { type: 'custom:m3e-tile-card', entity: 'cover.living_curtain', icon: 'curtains' },
    { type: 'custom:m3e-tile-card', entity: 'switch.living_tv', icon: 'tv' },
    { type: 'custom:m3e-climate-card', entity: 'climate.living_ac' },
    { type: 'custom:m3e-media-card', entity: 'media_player.living_speaker' },
  ],
  [
    { type: 'custom:m3e-heading-card', title: '寝室', icon: 'bed', entities: ['sensor.bedroom_temperature', 'sensor.bedroom_humidity'] },
    { type: 'custom:m3e-light-card', entity: 'light.bed_light', layout: 'color', color: 'pink' },
    { type: 'custom:m3e-tile-card', entity: 'light.bed_foot' },
    { type: 'custom:m3e-tile-card', entity: 'light.bed_ceiling' },
    { type: 'custom:m3e-tile-card', entity: 'humidifier.bedroom', icon: 'humidity-percentage' },
    { type: 'custom:m3e-tile-card', entity: 'climate.bedroom_ac', icon: 'ac-unit' },
    { type: 'custom:m3e-heading-card', title: 'キッチン', icon: 'kitchen', entities: ['sensor.kitchen_temperature', 'sensor.kitchen_humidity'] },
    { type: 'custom:m3e-light-card', entity: 'light.dining', layout: 'temperature' },
    { type: 'custom:m3e-tile-card', entity: 'light.kitchen' },
    { type: 'custom:m3e-tile-card', entity: 'switch.coffee_maker', icon: 'coffee-maker' },
    {
      type: 'custom:m3e-tile-card',
      entity: 'switch.dishwasher',
      icon: 'dishwasher',
      color: 'teal',
      state_text_on: '運転中',
      secondary_entity: 'sensor.dishwasher_remaining',
      secondary_prefix: '残り ',
    },
    { type: 'custom:m3e-tile-card', entity: 'fan.kitchen_vent', icon: 'mode-fan' },
  ],
];

/** Second-phase cards. */
SECTIONS.push([
  {
    type: 'custom:m3e-heading-card',
    title: 'カーテン・シェード',
    icon: 'roller-shades-closed',
    summary: {
      type: 'count',
      entities: ['cover.living_curtain', 'cover.bedroom_screen', 'cover.study_blind'],
      state: ['open', 'opening'],
      text: '{n}か所が開',
      zero_text: 'すべて閉',
    },
  },
  // One cover per card: the main one large, the rest as one-row cards under it.
  { type: 'custom:m3e-cover-card', entity: 'cover.living_curtain' },
  { type: 'custom:m3e-cover-card', entity: 'cover.bedroom_screen', layout: 'compact' },
  { type: 'custom:m3e-cover-card', entity: 'cover.study_blind', layout: 'compact', secondary: '書斎' },
  {
    type: 'custom:m3e-heading-card',
    title: 'セキュリティ',
    icon: 'shield',
    summary: {
      type: 'count',
      entities: ['lock.front_door', 'binary_sensor.back_door', 'binary_sensor.living_window', 'binary_sensor.garage_door'],
      state: ['unlocked', 'on', 'open'],
      text: '{n}件を確認',
      zero_text: 'すべて正常',
    },
  },
  // The heading groups them; each control is its own card.
  { type: 'custom:m3e-alarm-card', entity: 'alarm_control_panel.home' },
  { type: 'custom:m3e-lock-card', entity: 'lock.front_door', layout: 'compact' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.back_door', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.living_window', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.garage_door', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.hallway_motion', layout: 'row' },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '環境センサー', icon: 'sensors', meta: '空気の質 良好' },
  { type: 'custom:m3e-sensor-card', entity: 'sensor.living_temperature', name: 'リビングの室温' },
  { type: 'custom:m3e-sensor-card', entity: 'sensor.bedroom_humidity', name: '湿度', layout: 'compact' },
  { type: 'custom:m3e-sensor-card', entity: 'sensor.living_co2', layout: 'compact' },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '浴室・給湯', icon: 'hot-tub', entities: [{ entity: 'sensor.bath_temperature', name: '浴室' }] },
  {
    type: 'custom:m3e-water-heater-card',
    entity: 'water_heater.kyutoki',
    burning_entity: 'binary_sensor.kyutoki_burning',
    temperatures: [
      { entity: 'water_heater.kyutoki', name: '給湯' },
      { entity: 'number.bath_temperature', name: 'ふろ' },
    ],
    fill: { entity: 'sensor.bath_fill', remaining_entity: 'sensor.bath_fill_remaining' },
    modes: [
      { entity: 'switch.bath_auto', icon: 'hot-tub' },
      { entity: 'switch.bath_reheat', icon: 'local-fire-department' },
      { entity: 'switch.bath_keep_warm', icon: 'heat' },
    ],
    usage: [{ entity: 'sensor.gas_today' }, { entity: 'sensor.water_today' }],
  },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: 'カメラ', icon: 'videocam', meta: '録画中・3台' },
  {
    type: 'custom:m3e-camera-card',
    entity: 'camera.entrance',
    events: [
      { entity: 'binary_sensor.entrance_person', icon: 'person' },
      { entity: 'event.entrance_package', icon: 'local-shipping' },
    ],
    talk_entity: 'switch.entrance_talk',
  },
  { type: 'custom:m3e-camera-card', entity: 'camera.garden', layout: 'compact', time_entity: 'binary_sensor.garden_motion' },
  { type: 'custom:m3e-camera-card', entity: 'camera.garage', layout: 'compact', time_entity: 'binary_sensor.garage_motion' },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: 'エネルギー', icon: 'bolt', meta: '今日 8.6 kWh' },
  {
    type: 'custom:m3e-energy-card',
    power_entity: 'sensor.home_power',
    solar_power_entity: 'sensor.solar_power',
    battery_entity: 'sensor.battery_level',
    grid_power_entity: 'sensor.grid_power',
    devices: [
      { stat: 'sensor.ac_energy', name: 'エアコン' },
      { stat: 'sensor.water_heater_energy', name: '給湯器' },
      { stat: 'sensor.fridge_energy', name: '冷蔵庫' },
    ],
  },
  { type: 'custom:m3e-energy-flow-card', battery_entity: 'sensor.battery_level' },
  { type: 'custom:m3e-heading-card', title: 'エリア・デバイス別', icon: 'bolt', meta: '今日 8.6 kWh' },
  { type: 'custom:m3e-energy-sankey-card' },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '鍵', icon: 'lock' },
  {
    type: 'custom:m3e-lock-card',
    entity: 'lock.front_door',
    door_entity: 'binary_sensor.front_door_contact',
    battery_entity: 'sensor.front_door_lock_battery',
  },
  { type: 'custom:m3e-lock-card', entity: 'lock.back_door' },
]);

SECTIONS.push([
  {
    type: 'custom:m3e-heading-card',
    title: '家族',
    icon: 'group',
    summary: { type: 'count', entities: ['person.yuki', 'person.misaki', 'person.sora'], state: 'home', text: '在宅 {n}人・外出 {rest}人' },
  },
  {
    type: 'custom:m3e-presence-card',
    people: [
      { entity: 'person.yuki', color: 'blue' },
      { entity: 'person.misaki', color: 'pink' },
      { entity: 'person.sora', color: 'peach', eta_entity: 'sensor.sora_travel_time' },
    ],
    footnote: '全員が外出すると、自動で警備をオンにします',
  },
  {
    type: 'custom:m3e-heading-card',
    title: '家事',
    icon: 'local-laundry-service',
    summary: { type: 'count', entities: ['vacuum.robot', 'sensor.washer_job_state'], state: ['cleaning', 'wash', 'rinse', 'spin', 'drying'], text: '{n}台が運転中', zero_text: 'すべて停止中' },
  },
  {
    type: 'custom:m3e-vacuum-card',
    entity: 'vacuum.robot',
    battery_entity: 'sensor.robot_battery',
    current_room_entity: 'sensor.robot_current_room',
    progress_entity: 'sensor.robot_progress',
    remaining_entity: 'sensor.robot_remaining',
    cleaned_area_entity: 'sensor.robot_cleaned_area',
    last_clean_entity: 'sensor.robot_last_clean_begin',
    last_clean_duration_entity: 'sensor.robot_last_clean_duration',
    filter_entity: 'sensor.robot_filter_left',
    rooms: [
      { name: 'リビング', segment: 16, area: 10, selected: true },
      { name: 'キッチン', segment: 17, area: 8, selected: true },
      { name: '寝室', segment: 18, area: 8 },
      { name: '廊下', segment: 19, area: 4 },
      { name: '洗面所', segment: 20, area: 3 },
      { name: '子ども部屋', segment: 21, area: 7 },
    ],
  },
  {
    type: 'custom:m3e-laundry-card',
    entity: 'sensor.washer_job_state',
    power_entity: 'switch.washer_power',
    course_entity: 'sensor.washer_course',
    completion_entity: 'sensor.washer_completion_time',
    stats: [{ entity: 'sensor.washer_power', name: '消費電力' }, { entity: 'sensor.washer_detergent', name: '洗剤の自動投入', format: 'あと {v}回分' }],
    notify_entity: 'input_boolean.laundry_notify',
    notify_label: '終わったらスピーカーで知らせる',
  },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '予定・暮らし', icon: 'event', summary: { type: 'date' } },
  {
    type: 'custom:m3e-garbage-card',
    deadline: '08:30',
    schedule: [
      { type: '燃やすゴミ', days: ['tue', 'sat'] },
      { type: 'プラスチック資源', days: ['mon'] },
      { type: 'びん・缶・ペットボトル', days: ['thu'], weeks: [1, 3] },
    ],
    note: '前日 20:00 にスマホへ通知します',
  },
  {
    type: 'custom:m3e-agenda-card',
    calendars: [
      { entity: 'calendar.sora', person: 'そ', color: 'peach' },
      { entity: 'calendar.misaki', person: 'み', color: 'pink' },
      { entity: 'calendar.yuki', person: 'ゆ', color: 'blue' },
    ],
    todo: 'todo.shopping_list',
  },
]);

// mini: one row in a third of the section, so a heading can gather many readings and buttons.
SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: 'ひと目で', icon: 'sensors', summary: { type: 'count', entities: ['binary_sensor.back_door', 'binary_sensor.living_window', 'binary_sensor.garage_door'], state: 'on', text: '{n}か所が開', zero_text: 'すべて閉' } },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.back_door', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.living_window', name: '窓', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.hallway_motion', name: '廊下', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'sensor.home_power', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'sensor.living_co2', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'sensor.front_door_lock_battery', name: '錠の電池', layout: 'mini', min: 0, max: 100 },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.kyutoki_burning', name: '給湯器', on_text: '燃焼中', off_text: '停止', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'sensor.water_today', name: '今日の水道', layout: 'mini' },
  { type: 'custom:m3e-value-card', entity: 'sensor.living_humidity', name: '湿度', layout: 'mini' },
  { type: 'custom:m3e-heading-card', title: 'ボタン', icon: 'power-settings-new' },
  { type: 'custom:m3e-tile-card', entity: 'script.all_lights_off', icon: 'lightbulb', layout: 'mini' },
  { type: 'custom:m3e-tile-card', entity: 'input_button.pet_fed', name: 'ごはん', layout: 'mini' },
  { type: 'custom:m3e-tile-card', entity: 'button.intercom_unlock', name: '解錠', layout: 'mini' },
  { type: 'custom:m3e-tile-card', entity: 'input_boolean.laundry_notify', name: '洗濯の通知', icon: 'notifications-active', layout: 'mini' },
  { type: 'custom:m3e-tile-card', entity: 'light.living_floor', icon: 'floor-lamp', layout: 'mini' },
  { type: 'custom:m3e-tile-card', entity: 'switch.coffee_maker', icon: 'coffee-maker', layout: 'mini' },
  // At 3 columns the mini tile is an icon-only button, four to a line.
  { type: 'custom:m3e-tile-card', entity: 'scene.good_morning', layout: 'mini', grid_options: { columns: 3 } },
  { type: 'custom:m3e-tile-card', entity: 'scene.going_out', layout: 'mini', grid_options: { columns: 3 } },
  { type: 'custom:m3e-tile-card', entity: 'scene.theater', icon: 'tv', layout: 'mini', grid_options: { columns: 3 } },
  { type: 'custom:m3e-tile-card', entity: 'scene.good_night', layout: 'mini', grid_options: { columns: 3 } },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: 'ユーティリティ', icon: 'sensors' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.back_door' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.kyutoki_burning', name: '給湯器', on_text: '燃焼中', off_text: '停止' },
  { type: 'custom:m3e-value-card', entity: 'sensor.front_door_lock_battery', name: '玄関の錠の電池', min: 0, max: 100 },
  { type: 'custom:m3e-value-card', entity: 'sensor.home_power' },
  { type: 'custom:m3e-value-card', entity: 'sensor.water_today', name: '今日の水道', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'sensor.living_co2', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'binary_sensor.hallway_motion', layout: 'row' },
  { type: 'custom:m3e-value-card', entity: 'input_boolean.laundry_notify', name: '洗濯の通知', layout: 'row', tap_action: { action: 'toggle' } },
]);

// Added in the review round: new cards and the new options of existing ones.
SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '部屋', icon: 'meeting-room', tap_action: { action: 'navigate', navigation_path: '/lovelace/rooms' } },
  { type: 'custom:m3e-area-card', area: 'living' },
  { type: 'custom:m3e-area-card', area: 'bedroom', color: 'lavender' },
  { type: 'custom:m3e-heading-card', title: '空気', icon: 'air' },
  { type: 'custom:m3e-fan-card', entity: 'fan.living_purifier', sensors: ['sensor.living_pm25'] },
  { type: 'custom:m3e-fan-card', entity: 'fan.living_circulator' },
  { type: 'custom:m3e-fan-card', entity: 'humidifier.bedroom', sensors: ['sensor.bedroom_humidity'] },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '操作', icon: 'tune' },
  { type: 'custom:m3e-control-card', entity: 'input_select.house_mode', icon: 'home' },
  { type: 'custom:m3e-control-card', entity: 'input_select.wakeup_sound', icon: 'notifications-active' },
  { type: 'custom:m3e-control-card', entity: 'input_number.speaker_volume', icon: 'volume-up' },
  { type: 'custom:m3e-control-card', entity: 'number.bath_temperature', control: 'buttons', icon: 'hot-tub' },
  { type: 'custom:m3e-control-card', entity: 'input_number.speaker_volume', layout: 'row', icon: 'volume-up' },
  { type: 'custom:m3e-timer-card', entity: 'timer.kitchen', presets: ['1:00', '3:00', '5:00', '10:00'] },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: 'テレビ・天気', icon: 'tv' },
  { type: 'custom:m3e-remote-card', entity: 'media_player.living_tv', remote_entity: 'remote.living_tv', preset: 'android_tv' },
  { type: 'custom:m3e-weather-card', entity: 'weather.home' },
  { type: 'custom:m3e-hero-card', layout: 'footer', weather: 'weather.home', forecast_type: 'hourly', forecast_days: 4 },
]);

SECTIONS.push([
  { type: 'custom:m3e-heading-card', title: '追加した機能', icon: 'build' },
  { type: 'custom:m3e-maintenance-card' },
  { type: 'custom:m3e-alarm-card', entity: 'alarm_control_panel.home', show_actions: true },
  { type: 'custom:m3e-climate-card', entity: 'climate.kids_ac' },
  { type: 'custom:m3e-cover-card', entity: 'cover.study_blind' },
  {
    type: 'custom:m3e-media-card',
    entity: 'media_player.living_speaker',
    group_entities: ['media_player.kitchen_speaker'],
  },
  { type: 'custom:m3e-tile-card', entity: 'light.kitchen', double_tap_action: { action: 'more-info' } },
  { type: 'custom:m3e-tile-card', entity: 'light.does_not_exist' },
]);

// ?flip=binary_sensor.back_door,… starts with those sensors switched (screenshots).
for (const id of (new URLSearchParams(location.search).get('flip') ?? '').split(',').filter(Boolean)) {
  queueMicrotask(() => (window as unknown as { __hass: MockHass }).__hass.flip(id));
}

// ?only=3 renders a single section (for screenshots).
const only = new URLSearchParams(location.search).get('only');
if (only !== null) {
  const keep = SECTIONS[Number(only)];
  SECTIONS.length = 0;
  SECTIONS.push(keep);
  document.getElementById('sections')!.style.setProperty('--section-count', '1');
}

/** Badges along the top of the page. */
const BADGES = {
  type: 'custom:m3e-badges-card',
  badges: [
    { type: 'count', domain: 'light', name: '照明', text: '{n}つ点灯中', zero_text: 'すべて消灯', icon: 'lightbulb' },
    {
      type: 'average',
      entities: ['sensor.living_temperature', 'sensor.bedroom_temperature', 'sensor.kitchen_temperature'],
      name: '平均室温',
      icon: 'thermometer',
      color: 'red',
    },
    {
      type: 'average',
      entities: ['sensor.living_humidity', 'sensor.bedroom_humidity', 'sensor.kitchen_humidity'],
      name: '平均湿度',
      icon: 'water-drop',
      color: 'blue',
      decimals: 0,
    },
    { entity: 'sensor.home_power', name: '消費電力', color: 'peach' },
    { entity: 'lock.front_door', name: '玄関' },
  ],
};

/** Size a card in the section grid from its grid options, as HA's sections view does. */
function layoutCard(el: CardEl): void {
  // A card's own `grid_options` (set when resizing in HA's editor) win over its defaults.
  const own = configs.get(el)?.grid_options as LovelaceGridOptions | undefined;
  const grid = { ...(el.getGridOptions?.() ?? { columns: 12, rows: 'auto' }), ...own };
  const cols = grid.columns === 'full' ? 12 : (grid.columns ?? 12);
  el.style.gridColumn = `span ${cols}`;
  if (typeof grid.rows === 'number') {
    el.style.gridRow = `span ${grid.rows}`;
    el.style.height = `${grid.rows * 56 + (grid.rows - 1) * 8}px`;
  } else {
    el.style.gridRow = '';
    el.style.height = '';
  }
}

const hass = new MockHass();
const root = document.getElementById('sections')!;
const cards: CardEl[] = [];
const configs = new Map<CardEl, Record<string, unknown>>();

if (only === null) {
  const el = document.createElement('m3e-badges-card') as CardEl;
  el.setConfig(BADGES);
  el.style.cssText = 'display:block;padding:16px 16px 0';
  root.before(el);
  cards.push(el);
  configs.set(el, BADGES);
}

for (const section of SECTIONS) {
  const sec = document.createElement('div');
  sec.className = 'section';
  for (const config of section) {
    const tag = String(config.type).replace('custom:', '');
    const el = document.createElement(tag) as CardEl;
    el.setConfig(config);
    configs.set(el, config);
    layoutCard(el);
    sec.appendChild(el);
    cards.push(el);
  }
  root.appendChild(sec);
}

// Handy for poking at state from DevTools: __hass.latency = 1000
(window as unknown as { __hass: MockHass }).__hass = hass;

hass.subscribe((h) => {
  for (const c of cards) c.hass = h;
});

// HA's frontend runs hass-action (navigate, perform-action…); the preview logs it and runs perform-action on the mock.
window.addEventListener('hass-action', (e) => {
  const { config } = (e as CustomEvent<{ config: { entity?: string; tap_action: Record<string, unknown> } }>).detail;
  const action = config.tap_action;
  console.info('[preview] hass-action', action);
  const svc = (action.perform_action ?? action.service) as string | undefined;
  if (action.action === 'perform-action' && svc) {
    const [domain, service] = svc.split('.');
    hass.snapshot().callService(domain, service, (action.data ?? {}) as Record<string, unknown>, action.target as never);
  }
});

// ── toolbar ──────────────────────────────────────────────
const themeBtn = document.getElementById('theme') as HTMLButtonElement;
const applyTheme = (dark: boolean) => {
  document.documentElement.dataset.theme = dark ? 'mocha' : 'latte';
  themeBtn.textContent = dark ? 'Mocha (Dark)' : 'Latte (Light)';
  hass.setDarkMode(dark);
};
const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(new URLSearchParams(location.search).get('theme') === 'mocha' || (prefersDark && !location.search.includes('theme=latte')));
themeBtn.addEventListener('click', () => applyTheme(!hass.darkMode));

const latency = document.getElementById('latency') as HTMLInputElement;
latency.addEventListener('input', () => {
  hass.latency = Number(latency.value);
  document.getElementById('latency-value')!.textContent = `${latency.value}ms`;
});

// Simulated outage: ?offline (or the toolbar checkbox) makes data fetches fail, to check the
// error rows and their retry buttons. The energy settings are cached, so turn it on before loading.
const offline = document.getElementById('offline') as HTMLInputElement;
offline.checked = new URLSearchParams(location.search).has('offline');
hass.offline = offline.checked;
offline.addEventListener('change', () => (hass.offline = offline.checked));

// Card layout: ?cols=1 renders a single phone-width column.
const cols = new URLSearchParams(location.search).get('cols');
if (cols) root.style.setProperty('--section-count', cols);

// Optional controls: ?controls=off (or the toolbar checkbox) hides the fan / vane
// panel and the light sliders and presets, as show_* options in YAML would.
const HIDE: Record<string, Record<string, boolean>> = {
  'custom:m3e-climate-card': { show_fan_panel: false },
  'custom:m3e-light-card': { show_brightness: false, show_presets: false, show_color_sliders: false },
};
const controls = document.getElementById('controls') as HTMLInputElement;
// Density: ?density=compact|comfortable (or the toolbar select) sets `density` on every card.
const density = document.getElementById('density') as HTMLSelectElement;
const applyConfigs = () => {
  for (const [el, config] of configs) {
    const hide = controls.checked ? undefined : HIDE[String(config.type)];
    el.setConfig({ ...config, ...hide, ...(density.value !== 'auto' ? { density: density.value } : {}) });
    layoutCard(el);
  }
};
controls.checked = new URLSearchParams(location.search).get('controls') !== 'off';
density.value = new URLSearchParams(location.search).get('density') ?? 'auto';
applyConfigs();
controls.addEventListener('change', applyConfigs);
density.addEventListener('change', applyConfigs);
// Under `auto`, grid sizes follow the viewport (a tile is one row on phones).
matchMedia(COMPACT_QUERY).addEventListener('change', applyConfigs);
