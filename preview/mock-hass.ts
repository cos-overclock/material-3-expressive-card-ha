/**
 * A small in-memory Home Assistant for the preview page. Service calls mutate
 * entity states (immutably, as HA does) and every subscriber gets a new hass
 * object, so cards re-render exactly as they would in HA.
 */
import type { HassEntity, HomeAssistant } from '../src/ha/types';
import { hexToHs, hsToRgb, kelvinToRgb } from '../src/ha/color';
import { ENERGY_AREAS, ENERGY_PREFS, mockStatistics } from './mock-energy';

const rgbHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

type Listener = (hass: HomeAssistant) => void;

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

function todayAt(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function entity(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  const t = iso();
  return { entity_id, state, attributes, last_changed: t, last_updated: t };
}

const LIGHT_HS = { supported_color_modes: ['hs', 'color_temp'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 };
// pause, seek, volume set / mute, prev, next, select source, play, shuffle, repeat, grouping
const MEDIA_FEATURES = 1 | 2 | 4 | 8 | 16 | 32 | 2048 | 16384 | 32768 | 262144 | 524288;
// turn on / off, volume step / mute, select source, pause, play
const TV_FEATURES = 128 | 256 | 1024 | 8 | 2048 | 1 | 16384;

/** Stand-in album art: a dusk sky with a moon over hills. */
const MOCK_ARTWORK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5b4b9a"/><stop offset="0.55" stop-color="#e07a8c"/><stop offset="1" stop-color="#f6b979"/>
  </linearGradient></defs>
  <rect width="300" height="300" fill="url(#sky)"/>
  <circle cx="205" cy="92" r="34" fill="#fbe7b5"/>
  <path d="M0 210 Q80 160 150 200 T300 185 V300 H0Z" fill="#3a2f6b"/>
  <path d="M0 250 Q100 215 190 245 T300 240 V300 H0Z" fill="#1f1a3d"/>
</svg>`)}`;

function initialStates(): HassEntity[] {
  return [
    // Living
    entity('light.living_ceiling', 'on', { friendly_name: '天井照明', brightness: 204, color_mode: 'color_temp', color_temp_kelvin: 2700, ...LIGHT_HS }),
    entity('light.living_indirect', 'on', { friendly_name: '間接照明', brightness: 102, color_mode: 'brightness' }),
    entity('light.living_floor', 'off', { friendly_name: 'フロアランプ' }),
    entity('cover.living_curtain', 'open', { friendly_name: 'リビングのカーテン', current_position: 75, device_class: 'curtain', supported_features: 15 }),
    entity('switch.living_tv', 'off', { friendly_name: 'テレビ', icon: 'tv' }),
    entity('climate.living_ac', 'heat', {
      friendly_name: 'エアコン',
      hvac_modes: ['off', 'heat', 'cool', 'dry', 'fan_only', 'auto'],
      hvac_action: 'heating',
      temperature: 22.5,
      current_temperature: 21.8,
      current_humidity: 45,
      target_temp_step: 0.5,
      min_temp: 16,
      max_temp: 30,
      fan_modes: ['auto', 'quiet', 'low', 'medium', 'high'],
      fan_mode: 'auto',
      swing_modes: ['swing', '1', '2', '3', '4', '5'],
      swing_mode: 'swing',
      swing_horizontal_modes: ['swing', 'left', 'center', 'right', 'wide'],
      swing_horizontal_mode: 'center',
      preset_modes: ['none', 'eco', 'sleep', 'boost'],
      preset_mode: 'none',
    }),
    entity('media_player.living_speaker', 'playing', {
      friendly_name: 'リビング スピーカー',
      media_title: 'Evening Lo-fi',
      media_artist: 'おうちプレイリスト',
      media_duration: 232,
      media_position: 138,
      media_position_updated_at: iso(),
      entity_picture: MOCK_ARTWORK,
      shuffle: false,
      repeat: 'off',
      volume_level: 0.35,
      is_volume_muted: false,
      source: 'Spotify',
      source_list: ['Spotify', 'AirPlay', 'Bluetooth', 'ラジオ'],
      group_members: ['media_player.living_speaker'],
      supported_features: MEDIA_FEATURES,
    }),
    entity('media_player.kitchen_speaker', 'idle', { friendly_name: 'キッチン スピーカー', supported_features: MEDIA_FEATURES, group_members: [] }),
    entity('media_player.living_tv', 'on', {
      friendly_name: 'リビングのテレビ',
      device_class: 'tv',
      app_name: 'YouTube',
      source: 'HDMI 1',
      source_list: ['テレビ', 'HDMI 1', 'HDMI 2', 'YouTube', 'Netflix'],
      volume_level: 0.2,
      is_volume_muted: false,
      supported_features: TV_FEATURES,
    }),
    entity('remote.living_tv', 'on', { friendly_name: 'リビングのテレビ', current_activity: 'YouTube' }),
    entity('fan.living_purifier', 'on', {
      friendly_name: '空気清浄機',
      percentage: 40,
      percentage_step: 20,
      preset_modes: ['auto', 'sleep', 'turbo'],
      preset_mode: 'auto',
      supported_features: 1 | 8 | 16 | 32,
    }),
    entity('fan.living_circulator', 'on', {
      friendly_name: 'サーキュレーター',
      percentage: 50,
      oscillating: true,
      direction: 'forward',
      supported_features: 1 | 2 | 4 | 16 | 32,
    }),
    entity('sensor.living_pm25', '8', { friendly_name: 'PM2.5', device_class: 'pm25', unit_of_measurement: 'µg/m³' }),
    entity('input_select.house_mode', '在宅', { friendly_name: '家のモード', options: ['在宅', '外出', '就寝', '長期不在'] }),
    entity('input_select.wakeup_sound', '小鳥', { friendly_name: '目覚ましの音', options: ['小鳥', '波', '風鈴', 'ピアノ', 'ラジオ', 'チャイム'] }),
    entity('input_number.speaker_volume', '35', { friendly_name: '通知の音量', min: 0, max: 100, step: 5, unit_of_measurement: '%', mode: 'slider' }),
    entity('timer.kitchen', 'idle', { friendly_name: 'キッチンタイマー', duration: '0:05:00' }),
    entity('update.router_firmware', 'on', {
      friendly_name: 'ルーターのファームウェア',
      title: 'ルーター',
      installed_version: '1.2.0',
      latest_version: '1.3.1',
      supported_features: 1,
    }),
    entity('update.home_assistant_core', 'off', { friendly_name: 'Home Assistant Core', installed_version: '2026.11.1', latest_version: '2026.11.1' }),
    entity('sensor.hallway_motion_battery', '12', { friendly_name: '廊下の人感センサーの電池', device_class: 'battery', unit_of_measurement: '%' }),
    entity('sensor.balcony_temperature', 'unavailable', { friendly_name: 'ベランダの温度', device_class: 'temperature', unit_of_measurement: '°C' }),
    entity('climate.kids_ac', 'heat_cool', {
      friendly_name: '子ども部屋のエアコン',
      hvac_modes: ['off', 'heat_cool', 'heat', 'cool'],
      hvac_action: 'idle',
      current_temperature: 23.4,
      target_temp_low: 20,
      target_temp_high: 26,
      target_temp_step: 0.5,
      min_temp: 16,
      max_temp: 30,
    }),
    entity('sensor.living_temperature', '21.8', { device_class: 'temperature', unit_of_measurement: '°C' }),
    entity('sensor.living_humidity', '45', { device_class: 'humidity', unit_of_measurement: '%' }),

    // Bedroom
    entity('light.bed_light', 'on', {
      friendly_name: 'ベッドライト',
      brightness: 115,
      color_mode: 'hs',
      hs_color: [325, 56],
      effect_list: ['なし', 'キャンドル', '呼吸', '虹', 'オーロラ'],
      effect: 'なし',
      ...LIGHT_HS,
    }),
    entity('light.bed_foot', 'on', { friendly_name: 'フットライト', brightness: 26, color_mode: 'brightness' }),
    entity('light.bed_ceiling', 'off', { friendly_name: '天井照明' }),
    entity('humidifier.bedroom', 'on', {
      friendly_name: '加湿器',
      humidity: 50,
      min_humidity: 30,
      max_humidity: 70,
      current_humidity: 42,
      action: 'humidifying',
      available_modes: ['normal', 'eco', 'sleep', 'auto', 'boost'],
      mode: 'normal',
      supported_features: 1,
    }),
    entity('climate.bedroom_ac', 'off', { friendly_name: 'エアコン', hvac_modes: ['off', 'heat', 'cool'] }),
    entity('sensor.bedroom_temperature', '20.6', { device_class: 'temperature', unit_of_measurement: '°C' }),
    entity('sensor.bedroom_humidity', '52', { device_class: 'humidity', unit_of_measurement: '%' }),

    // Kitchen
    entity('light.dining', 'on', { friendly_name: 'ダイニング照明', brightness: 179, color_mode: 'color_temp', color_temp_kelvin: 3500, ...LIGHT_HS }),
    entity('light.kitchen', 'on', { friendly_name: 'キッチン照明', brightness: 255, color_mode: 'brightness' }),
    entity('switch.coffee_maker', 'off', { friendly_name: 'コーヒーメーカー' }),
    entity('switch.dishwasher', 'on', { friendly_name: '食洗機' }),
    entity('sensor.dishwasher_remaining', '42', { unit_of_measurement: '分' }),
    entity('fan.kitchen_vent', 'off', { friendly_name: '換気扇', percentage: 0 }),
    entity('sensor.kitchen_temperature', '23.1', { device_class: 'temperature', unit_of_measurement: '°C' }),
    entity('sensor.kitchen_humidity', '48', { device_class: 'humidity', unit_of_measurement: '%' }),

    // Study: a light that does both full colour and colour temperature
    entity('light.study_desk', 'on', {
      friendly_name: 'デスクライト',
      brightness: 166,
      color_mode: 'color_temp',
      color_temp_kelvin: 5000,
      supported_color_modes: ['color_temp', 'rgb'],
      min_color_temp_kelvin: 2200,
      max_color_temp_kelvin: 6500,
    }),
    // An AC whose fan speed and vanes are separate entities, each with an auto / manual switch.
    entity('climate.study_ac', 'cool', {
      friendly_name: 'エアコン',
      hvac_modes: ['off', 'heat', 'cool', 'dry', 'fan_only'],
      hvac_action: 'cooling',
      temperature: 26,
      current_temperature: 27.4,
      target_temp_step: 1,
      min_temp: 16,
      max_temp: 31,
    }),
    // Ten speeds: too many buttons, so the card shows a slider.
    entity('select.study_ac_fan_speed', '3', { friendly_name: '風量', options: ['静音', '1', '2', '3', '4', '5', '6', '7', '8', 'パワフル'] }),
    entity('switch.study_ac_fan_auto', 'on', { friendly_name: '風量自動' }),
    entity('select.study_ac_vane_vertical', '2', { friendly_name: '上下風向', options: ['スイング', '1', '2', '3', '4', '5', '6', '7'] }),
    entity('select.study_ac_vane_mode', 'マニュアル', { friendly_name: '上下風向モード', options: ['オート', 'マニュアル'] }),
    // A vane angle in 5° steps: a slider over the entity's own range.
    entity('number.study_ac_vane_horizontal', '0', { friendly_name: '左右風向', min: -60, max: 60, step: 5, unit_of_measurement: '°' }),
    entity('input_boolean.study_ac_vane_horizontal_auto', 'off', { friendly_name: '左右風向自動' }),

    // Covers
    entity('cover.bedroom_screen', 'closed', { friendly_name: 'ロールスクリーン', current_position: 0, device_class: 'shade', supported_features: 15 }),
    entity('cover.study_blind', 'open', { friendly_name: 'ブラインド', current_position: 50, current_tilt_position: 50, device_class: 'blind', supported_features: 255 }),
    entity('sun.sun', 'below_horizon', { friendly_name: '太陽' }),

    entity('sensor.living_co2', '620', { friendly_name: 'CO₂', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),

    // Bath / water heater
    entity('water_heater.kyutoki', 'gas', { friendly_name: '給湯器', temperature: 40, min_temp: 32, max_temp: 60, target_temp_step: 1, operation_list: ['gas', 'off'] }),
    entity('number.bath_temperature', '42', { friendly_name: 'ふろ温度', min: 35, max: 48, step: 1, unit_of_measurement: '°C' }),
    entity('binary_sensor.kyutoki_burning', 'on', { friendly_name: '燃焼', device_class: 'heat' }),
    entity('sensor.bath_fill', '68', { friendly_name: 'お湯はり', unit_of_measurement: '%' }),
    entity('sensor.bath_fill_remaining', '6', { friendly_name: 'お湯はり残り時間', unit_of_measurement: '分' }),
    entity('switch.bath_auto', 'on', { friendly_name: 'ふろ自動' }),
    entity('switch.bath_reheat', 'off', { friendly_name: '追いだき' }),
    entity('switch.bath_keep_warm', 'off', { friendly_name: '保温' }),
    entity('sensor.gas_today', '0.82', { friendly_name: 'ガス', unit_of_measurement: 'm³' }),
    entity('sensor.water_today', '186', { friendly_name: '水', unit_of_measurement: 'L' }),
    entity('sensor.bath_temperature', '24.5', { device_class: 'temperature', unit_of_measurement: '°C' }),

    // Energy (live power)
    entity('sensor.home_power', '1.24', { friendly_name: '消費電力', device_class: 'power', unit_of_measurement: 'kW' }),
    entity('sensor.solar_power', '2.10', { friendly_name: '太陽光', device_class: 'power', unit_of_measurement: 'kW' }),
    entity('sensor.battery_level', '86', { friendly_name: '蓄電池', device_class: 'battery', unit_of_measurement: '%' }),
    entity('sensor.grid_power', '-0.86', { friendly_name: '系統', device_class: 'power', unit_of_measurement: 'kW' }),
    ...[
      ['sensor.ac_energy', 'エアコン'],
      ['sensor.tv_energy', 'テレビ'],
      ['sensor.living_light_energy', 'リビング照明'],
      ['sensor.fridge_energy', '冷蔵庫'],
      ['sensor.dishwasher_energy', '食洗機'],
      ['sensor.coffee_energy', 'コーヒーメーカー'],
      ['sensor.water_heater_energy', '給湯器'],
      ['sensor.humidifier_energy', '加湿器'],
      ['sensor.bedroom_light_energy', '寝室照明'],
    ].map(([id, name]) => entity(id, '0', { friendly_name: name, device_class: 'energy', unit_of_measurement: 'kWh' })),

    // Cameras
    entity('camera.entrance', 'streaming', { friendly_name: '玄関カメラ', entity_picture: '/preview/cameras/entrance.svg' }),
    entity('camera.garden', 'idle', { friendly_name: '庭', entity_picture: '/preview/cameras/garden.svg' }),
    entity('camera.garage', 'idle', { friendly_name: 'ガレージ', entity_picture: '/preview/cameras/garage.svg' }),
    { ...entity('binary_sensor.entrance_person', 'off', { friendly_name: '人を検知', device_class: 'occupancy' }), last_changed: iso(-37 * 60_000) },
    entity('event.entrance_package', iso(-130 * 60_000), { friendly_name: '荷物', event_type: 'package' }),
    { ...entity('binary_sensor.garden_motion', 'off', { friendly_name: '庭の動き', device_class: 'motion' }), last_changed: iso(-60_000) },
    { ...entity('binary_sensor.garage_motion', 'off', { friendly_name: 'ガレージの動き', device_class: 'motion' }), last_changed: iso(-3 * 60_000) },
    entity('switch.entrance_talk', 'off', { friendly_name: '通話' }),

    // Security
    // Arm home / away / night / vacation; disarming needs the code 1234.
    entity('alarm_control_panel.home', 'armed_home', { friendly_name: 'ホームセキュリティ', supported_features: 1 | 2 | 4 | 32, code_format: 'number', code_arm_required: false }),
    { ...entity('lock.front_door', 'locked', { friendly_name: '玄関ドア', changed_by: 'ゆうき' }), last_changed: todayAt(18, 5) },
    // A smart lock with a PIN (1234) that can also unlatch the door (LockEntityFeature.OPEN).
    { ...entity('lock.back_door', 'locked', { friendly_name: '勝手口', code_format: '^\\d{4}$', supported_features: 1 }), last_changed: todayAt(7, 40) },
    entity('binary_sensor.front_door_contact', 'off', { friendly_name: '玄関ドア', device_class: 'door' }),
    entity('sensor.front_door_lock_battery', '82', { friendly_name: '玄関ドアの電池', device_class: 'battery', unit_of_measurement: '%' }),
    entity('binary_sensor.back_door', 'off', { friendly_name: '勝手口', device_class: 'door' }),
    entity('binary_sensor.living_window', 'off', { friendly_name: '窓（リビング）', device_class: 'window' }),
    entity('binary_sensor.garage_door', 'off', { friendly_name: 'ガレージ', device_class: 'garage_door' }),
    entity('binary_sensor.hallway_motion', 'off', { friendly_name: '人感センサー（廊下）', device_class: 'motion' }),
    entity('binary_sensor.bedroom_motion', 'on', { friendly_name: '人感センサー（寝室）', device_class: 'occupancy' }),

    // Overview
    entity('scene.good_morning', iso(-10 * 3600_000), { friendly_name: 'おはよう', icon: 'wb-twilight' }),
    entity('scene.going_out', iso(-8 * 3600_000), { friendly_name: 'おでかけ', icon: 'door-front' }),
    entity('scene.theater', iso(-20 * 60_000), { friendly_name: 'シアター', icon: 'tv' }),
    entity('scene.good_night', iso(-30 * 3600_000), { friendly_name: 'おやすみ', icon: 'nights-stay' }),
    entity('weather.home', 'partlycloudy', {
      friendly_name: '自宅',
      temperature: 14,
      apparent_temperature: 12,
      humidity: 62,
      wind_speed: 11,
      wind_speed_unit: 'km/h',
    }),
    { ...entity('person.yuki', 'home', { friendly_name: 'ゆうき' }), last_changed: iso(-40 * 60_000) },
    { ...entity('person.misaki', 'home', { friendly_name: 'みさき' }), last_changed: iso(-30 * 3600_000) },
    { ...entity('person.sora', '駅前の塾', { friendly_name: 'そら' }), last_changed: iso(-150 * 60_000) },
    entity('sensor.sora_travel_time', '15', { friendly_name: 'そらの帰宅時間', unit_of_measurement: 'min' }),

    // Housework
    entity('vacuum.robot', 'cleaning', { friendly_name: 'ロボット掃除機', fan_speed: 'balanced', fan_speed_list: ['quiet', 'balanced', 'turbo', 'max'], supported_features: 16383 }),
    entity('sensor.robot_battery', '64', { device_class: 'battery', unit_of_measurement: '%' }),
    entity('sensor.robot_current_room', 'リビング', { friendly_name: '掃除中の部屋' }),
    entity('sensor.robot_progress', '67', { unit_of_measurement: '%' }),
    entity('sensor.robot_remaining', '9', { unit_of_measurement: 'min' }),
    entity('sensor.robot_cleaned_area', '12', { unit_of_measurement: 'm²' }),
    entity('sensor.robot_last_clean_begin', iso(-31 * 3600_000), { device_class: 'timestamp' }),
    entity('sensor.robot_last_clean_duration', '1920', { device_class: 'duration', unit_of_measurement: 's' }),
    entity('sensor.robot_filter_left', '82', { friendly_name: 'フィルター寿命', unit_of_measurement: '%' }),
    entity('sensor.washer_job_state', 'drying', { friendly_name: '洗濯乾燥機', options: ['none', 'wash', 'rinse', 'spin', 'drying', 'finished'] }),
    entity('switch.washer_power', 'on', { friendly_name: '洗濯乾燥機の電源' }),
    entity('sensor.washer_course', '標準コース', { friendly_name: 'コース' }),
    entity('sensor.washer_completion_time', iso(42 * 60_000), { device_class: 'timestamp' }),
    entity('sensor.washer_power', '0.82', { friendly_name: '消費電力', device_class: 'power', unit_of_measurement: 'kW' }),
    entity('sensor.washer_detergent', '12', { friendly_name: '洗剤の自動投入', unit_of_measurement: '回' }),
    entity('input_boolean.laundry_notify', 'on', { friendly_name: '終わったらスピーカーで知らせる' }),

    // One-shot buttons
    entity('script.all_lights_off', 'off', { friendly_name: 'すべて消灯', last_triggered: iso(-14 * 3600_000) }),
    entity('input_button.pet_fed', iso(-5 * 3600_000), { friendly_name: 'ごはんをあげた', icon: 'pets' }),
    entity('button.intercom_unlock', 'unknown', { friendly_name: 'オートロック解錠', icon: 'door-front' }),

    // Schedule
    entity('calendar.sora', 'off', { friendly_name: 'そら' }),
    entity('calendar.misaki', 'off', { friendly_name: 'みさき' }),
    entity('calendar.yuki', 'off', { friendly_name: 'ゆうき' }),
    entity('todo.shopping_list', '3', { friendly_name: '買い物リスト' }),
  ];
}

const AREAS: Record<string, string> = { living: 'リビング', bedroom: '寝室', kitchen: 'キッチン', study: '書斎', bath: '浴室・給湯', entrance: '玄関' };
const ENTITY_AREA: Record<string, string> = {
  'cover.living_curtain': 'living',
  'cover.bedroom_screen': 'bedroom',
  'cover.study_blind': 'study',
  ...ENERGY_AREAS,
  'sensor.living_temperature': 'living',
  'sensor.living_humidity': 'living',
  'light.living_ceiling': 'living',
  'light.living_indirect': 'living',
  'light.living_floor': 'living',
  'climate.living_ac': 'living',
  'binary_sensor.living_window': 'living',
  'media_player.living_speaker': 'living',
  'fan.living_purifier': 'living',
  'sensor.bedroom_temperature': 'bedroom',
  'sensor.bedroom_humidity': 'bedroom',
  'light.bed_light': 'bedroom',
  'light.bed_foot': 'bedroom',
  'light.bed_ceiling': 'bedroom',
  'humidifier.bedroom': 'bedroom',
  'climate.bedroom_ac': 'bedroom',
  'binary_sensor.bedroom_motion': 'bedroom',
};

/** Synthetic daily curves for the history API, by device class. */
function historyValue(entityId: string, t: number): number | undefined {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const wave = (peak: number, width: number) => Math.exp(-((((h - peak + 36) % 24) - 12) ** 2) / (2 * width * width));
  if (entityId.endsWith('_temperature')) return 19.4 + 3.7 * wave(13.5, 3.6) - 0.6 * wave(3, 2.5) + 1.2 * wave(19.5, 2.2);
  if (entityId.endsWith('_humidity')) return 50 + 3 * Math.sin((h / 24) * Math.PI * 4) - 2 * wave(13, 3);
  if (entityId.endsWith('_co2')) return 560 + 240 * wave(8, 1.4) + 120 * wave(19, 2) + 20 * Math.sin(h);
  return undefined;
}

function mockHistory(msg: Record<string, unknown>): Record<string, { s: string; lu: number }[]> {
  const start = Date.parse(String(msg.start_time));
  const end = Date.parse(String(msg.end_time));
  const out: Record<string, { s: string; lu: number }[]> = {};
  for (const id of msg.entity_ids as string[]) {
    const pts: { s: string; lu: number }[] = [];
    for (let t = start; t <= end; t += 10 * 60_000) {
      const v = historyValue(id, t);
      if (v !== undefined) pts.push({ s: v.toFixed(2), lu: t / 1000 });
    }
    out[id] = pts;
  }
  return out;
}

function atToday(h: number, m: number, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Events a little after "now" so the preview always has something coming up. */
function mockCalendar(path: string): unknown[] {
  const id = path.split('?')[0].replace('calendars/', '');
  const soon = new Date(Date.now() + 75 * 60_000);
  soon.setMinutes(0, 0, 0);
  const local = (d: Date) => d.toISOString();
  const ev = (summary: string, start: Date, end: Date, location?: string) => ({
    uid: `${id}-${summary}`,
    summary,
    location,
    start: { dateTime: local(start) },
    end: { dateTime: local(end) },
  });
  if (id === 'calendar.sora') return [ev('スイミング', soon, new Date(soon.getTime() + 3600_000), '市民プール')];
  if (id === 'calendar.misaki') return [ev('オンライン英会話', new Date(soon.getTime() + 2 * 3600_000), new Date(soon.getTime() + 2.5 * 3600_000))];
  if (id === 'calendar.yuki') return [ev('車の12か月点検', atToday(10, 0, 1), atToday(11, 30, 1), 'ディーラー')];
  return [];
}

/** Next 24 hours: a mild day that turns to rain in the evening. */
const HOURLY = (() => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => {
    const t = new Date(start.getTime() + i * 3600_000);
    const h = t.getHours();
    const dh = Math.min(Math.abs(h - 14), 24 - Math.abs(h - 14));
    const temp = 11 + 6 * Math.exp(-(dh ** 2) / 30);
    const rain = h >= 19 && h <= 23;
    return {
      datetime: t.toISOString(),
      condition: rain ? 'rainy' : h >= 18 || h < 6 ? (h >= 18 ? 'cloudy' : 'clear-night') : h < 11 ? 'sunny' : 'partlycloudy',
      temperature: Math.round(temp),
      precipitation_probability: rain ? 70 : h >= 16 ? 30 : 0,
    };
  });
})();

const FORECAST = (() => {
  const conds: [string, number, number, number][] = [
    ['partlycloudy', 17, 9, 20],
    ['sunny', 17, 9, 0],
    ['partlycloudy', 16, 10, 10],
    ['rainy', 13, 8, 80],
    ['cloudy', 15, 9, 30],
    ['sunny', 18, 10, 0],
  ];
  return conds.map(([condition, temperature, templow, precipitation_probability], i) => ({
    datetime: new Date(Date.now() + i * 86400_000).toISOString(),
    condition,
    temperature,
    templow,
    precipitation_probability,
  }));
})();

export class MockHass {
  private states: Record<string, HassEntity> = {};
  /** Entity registry: stable between updates, as HA's is. */
  private registry = Object.fromEntries(Object.entries(ENTITY_AREA).map(([entity_id, area_id]) => [entity_id, { entity_id, area_id }]));
  private listeners = new Set<Listener>();
  darkMode = false;
  /** Simulated device latency. */
  latency = 100;
  /** Simulated outage: history, statistics, calendars, to-do lists and forecasts fail to load. */
  offline = false;

  constructor() {
    for (const e of initialStates()) this.states[e.entity_id] = e;
    this.startBathFill();
    setInterval(() => {
      if (this.states['vacuum.robot'].state !== 'cleaning') return;
      const p = Math.min(100, Number(this.states['sensor.robot_progress'].state) + 1);
      this.update('sensor.robot_progress', String(p));
      this.update('sensor.robot_remaining', String(Math.ceil((100 - p) * 0.27)));
      this.update('sensor.robot_cleaned_area', String(Math.round((p / 100) * 18)));
      if (p > 70) this.update('sensor.robot_current_room', 'キッチン');
      if (p >= 100) this.update('vacuum.robot', 'returning');
      this.emit();
    }, 4000);
  }

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
    fn(this.snapshot());
  }

  /** DevTools helper: __hass.flip('binary_sensor.back_door') toggles a sensor. */
  flip(id: string): void {
    const s = this.states[id];
    if (!s) return;
    this.update(id, s.state === 'on' ? 'off' : 'on');
    this.emit();
  }

  /** DevTools helper: __hass.set('alarm_control_panel.home', 'triggered'). */
  set(id: string, state: string, attrs: Record<string, unknown> = {}): void {
    this.update(id, state, attrs);
    this.emit();
  }

  setDarkMode(dark: boolean): void {
    this.darkMode = dark;
    this.emit();
  }

  private emit(): void {
    const hass = this.snapshot();
    this.listeners.forEach((fn) => fn(hass));
  }

  private update(id: string, state: string | undefined, attrs: Record<string, unknown> = {}): void {
    const prev = this.states[id];
    if (!prev) return;
    const now = iso();
    const nextState = state ?? prev.state;
    this.states = {
      ...this.states,
      [id]: {
        ...prev,
        state: nextState,
        attributes: { ...prev.attributes, ...attrs },
        last_changed: nextState !== prev.state ? now : prev.last_changed,
        last_updated: now,
      },
    };
  }

  todo = [
    { uid: 'milk', summary: '牛乳', status: 'needs_action' },
    { uid: 'bread', summary: '食パン', status: 'needs_action' },
    { uid: 'detergent', summary: '洗濯洗剤（詰め替え）', status: 'needs_action' },
    { uid: 'tp', summary: 'トイレットペーパー', status: 'completed' },
  ];

  snapshot(): HomeAssistant {
    return {
      states: this.states,
      themes: { darkMode: this.darkMode },
      areas: Object.fromEntries(Object.entries(AREAS).map(([area_id, name]) => [area_id, { area_id, name }])),
      entities: this.registry,
      user: { id: 'preview', name: 'プレビュー', is_admin: true },
      locale: { language: 'ja' },
      callService: (domain, service, data = {}, target) => {
        const ids = [target?.entity_id ?? (data.entity_id as string | string[] | undefined)].flat().filter(Boolean) as string[];
        console.debug('[mock] %s.%s', domain, service, ids, data);
        return new Promise((resolve, reject) =>
          setTimeout(() => {
            try {
              ids.forEach((id) => this.handle(domain, service, id, data));
            } catch (e) {
              reject(e);
              return;
            }
            this.emit();
            resolve(undefined);
          }, this.latency),
        );
      },
      callApi: async <T,>(method: string, path: string): Promise<T> => {
        await new Promise((r) => setTimeout(r, 150));
        if (this.offline) throw new Error('mock: offline');
        if (method === 'GET' && path.startsWith('calendars/')) return mockCalendar(path) as T;
        throw new Error(`mock: ${method} ${path} not implemented`);
      },
      callWS: async <T,>(msg: Record<string, unknown>): Promise<T> => {
        await new Promise((r) => setTimeout(r, 150));
        if (this.offline) throw new Error('mock: offline');
        if (msg.type === 'history/history_during_period') return mockHistory(msg) as T;
        if (msg.type === 'energy/get_prefs') return ENERGY_PREFS as T;
        if (msg.type === 'todo/item/list') return { items: this.todo.map((i) => ({ ...i })) } as T;
        if (msg.type === 'recorder/statistics_during_period') return mockStatistics(msg) as T;
        throw new Error(`mock: ${String(msg.type)} not implemented`);
      },
      connection: {
        subscribeMessage: async <T,>(cb: (msg: T) => void, msg: Record<string, unknown>) => {
          if (this.offline) {
            await new Promise((r) => setTimeout(r, 150));
            throw new Error('mock: offline');
          }
          if (msg.type === 'weather/subscribe_forecast') {
            const hourly = msg.forecast_type === 'hourly';
            setTimeout(() => cb({ type: msg.forecast_type, forecast: hourly ? HOURLY : FORECAST } as T), 200);
          }
          return () => {};
        },
      },
    };
  }

  private bathTimer?: ReturnType<typeof setInterval>;
  private timerDone?: ReturnType<typeof setTimeout>;

  /** ふろ自動: fill from the current level to 100 %, then keep warm. */
  startBathFill(): void {
    clearInterval(this.bathTimer);
    if (Number(this.states['sensor.bath_fill'].state) >= 100) this.update('sensor.bath_fill', '0');
    this.bathTimer = setInterval(() => {
      const pct = Math.min(100, Number(this.states['sensor.bath_fill'].state) + 1);
      this.update('sensor.bath_fill', String(pct));
      this.update('sensor.bath_fill_remaining', String(Math.ceil(((100 - pct) / 100) * 18)));
      this.update('binary_sensor.kyutoki_burning', pct < 100 ? 'on' : 'off');
      if (pct >= 100) {
        clearInterval(this.bathTimer);
        this.update('switch.bath_keep_warm', 'on');
      }
      this.emit();
    }, 2500);
  }

  private coverTimers = new Map<string, ReturnType<typeof setInterval>>();

  /** Covers move a few percent per tick, reporting opening / closing on the way. */
  private moveCover(id: string, target: number): void {
    this.stopCover(id, false);
    const timer = setInterval(() => {
      const pos = Number(this.states[id].attributes.current_position ?? 0);
      if (pos === target) {
        this.stopCover(id);
        return;
      }
      const next = pos < target ? Math.min(target, pos + 5) : Math.max(target, pos - 5);
      this.update(id, next > pos ? 'opening' : 'closing', { current_position: next });
      this.emit();
    }, 180);
    this.coverTimers.set(id, timer);
  }

  private stopCover(id: string, emit = true): void {
    clearInterval(this.coverTimers.get(id));
    this.coverTimers.delete(id);
    const pos = Number(this.states[id].attributes.current_position ?? 0);
    this.update(id, pos > 0 ? 'open' : 'closed');
    if (emit) this.emit();
  }

  private handle(domain: string, service: string, id: string, data: Record<string, unknown>): void {
    const s = this.states[id];
    if (!s) return;
    const d = id.split('.')[0];
    const on = s.state === 'on';
    if (domain === 'homeassistant' && service === 'toggle') return this.handle(d, 'toggle', id, data);

    switch (d) {
      case 'light': {
        if (service === 'turn_off' || (service === 'toggle' && on)) return this.update(id, 'off', { brightness: null });
        const attrs: Record<string, unknown> = {};
        if (data.brightness_pct != null) attrs.brightness = Math.round((Number(data.brightness_pct) / 100) * 255);
        else if (!on) attrs.brightness = s.attributes.last_brightness ?? 204;
        if (data.hs_color) {
          const [h, sat] = data.hs_color as [number, number];
          Object.assign(attrs, { hs_color: [h, sat], rgb_color: hsToRgb(h, sat).map(Math.round), color_mode: 'hs' });
        }
        if (data.color_temp_kelvin) {
          const k = Number(data.color_temp_kelvin);
          // HA also reports an approximate rgb/hs for white light.
          Object.assign(attrs, { color_temp_kelvin: k, color_mode: 'color_temp', rgb_color: kelvinToRgb(k), hs_color: hexToHs(rgbHex(kelvinToRgb(k))) });
        }
        if (data.effect) attrs.effect = data.effect;
        if (attrs.brightness) attrs.last_brightness = attrs.brightness;
        return this.update(id, 'on', attrs);
      }
      case 'todo': {
        if (service === 'add_item') this.todo.unshift({ uid: `item-${Date.now()}`, summary: String(data.item), status: 'needs_action' });
        if (service === 'update_item') this.todo = this.todo.map((i) => (i.uid === data.item ? { ...i, status: String(data.status) } : i));
        return this.update(id, String(this.todo.filter((i) => i.status === 'needs_action').length));
      }
      case 'vacuum': {
        if (service === 'set_fan_speed') return this.update(id, undefined, { fan_speed: data.fan_speed });
        if (service === 'locate') return;
        const next: Record<string, string> = { start: 'cleaning', pause: 'paused', stop: 'idle', return_to_base: 'returning', send_command: 'cleaning' };
        if (service === 'send_command') {
          this.update('sensor.robot_progress', '0');
          this.update('sensor.robot_cleaned_area', '0');
        }
        this.update(id, next[service] ?? s.state);
        if (service === 'return_to_base') setTimeout(() => (this.update(id, 'docked'), this.emit()), 3000);
        return;
      }
      case 'water_heater':
        return this.update(id, undefined, { temperature: data.temperature });
      case 'select':
      case 'input_select':
        return this.update(id, String(data.option));
      case 'number':
      case 'input_number':
        return this.update(id, String(data.value));
      case 'switch':
        if (id === 'switch.bath_auto') {
          const next = service === 'toggle' ? !on : service === 'turn_on';
          this.update(id, next ? 'on' : 'off');
          if (next) this.startBathFill();
          return;
        }
        return this.update(id, service === 'toggle' ? (on ? 'off' : 'on') : service === 'turn_on' ? 'on' : 'off');
      case 'input_boolean':
        return this.update(id, service === 'toggle' ? (on ? 'off' : 'on') : service === 'turn_on' ? 'on' : 'off');
      case 'humidifier':
        if (service === 'set_humidity') return this.update(id, undefined, { humidity: data.humidity });
        if (service === 'set_mode') return this.update(id, undefined, { mode: data.mode });
        return this.update(id, service === 'toggle' ? (on ? 'off' : 'on') : service === 'turn_on' ? 'on' : 'off', {
          action: service === 'turn_off' || (service === 'toggle' && on) ? 'off' : 'humidifying',
        });
      case 'fan': {
        if (service === 'set_percentage') return this.update(id, Number(data.percentage) > 0 ? 'on' : 'off', { percentage: data.percentage });
        if (service === 'set_preset_mode') return this.update(id, 'on', { preset_mode: data.preset_mode });
        if (service === 'oscillate') return this.update(id, undefined, { oscillating: data.oscillating });
        if (service === 'set_direction') return this.update(id, undefined, { direction: data.direction });
        const next = service === 'toggle' ? !on : service === 'turn_on';
        return this.update(id, next ? 'on' : 'off', { percentage: next ? (s.attributes.last_percentage ?? 50) : 0, last_percentage: s.attributes.percentage || 50 });
      }
      case 'remote':
        if (service === 'turn_on' || service === 'turn_off') return this.update(id, service === 'turn_on' ? 'on' : 'off');
        return; // send_command: logged above
      case 'timer': {
        const total = (v: unknown) => String(v ?? '0:0:0').split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
        const fmt = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
        clearTimeout(this.timerDone);
        const finish = (sec: number) => {
          this.timerDone = setTimeout(() => (this.update(id, 'idle', { finishes_at: undefined, remaining: undefined }), this.emit()), sec * 1000);
          return new Date(Date.now() + sec * 1000).toISOString();
        };
        if (service === 'start') {
          const sec = s.state === 'paused' && !data.duration ? total(s.attributes.remaining) : total(data.duration ?? s.attributes.duration);
          return this.update(id, 'active', { duration: data.duration ?? s.attributes.duration, finishes_at: finish(sec), remaining: fmt(sec) });
        }
        if (service === 'pause') {
          const left = Math.max(0, (Date.parse(s.attributes.finishes_at) - Date.now()) / 1000);
          return this.update(id, 'paused', { remaining: fmt(left), finishes_at: undefined });
        }
        if (service === 'change') {
          const left = Math.max(0, (Date.parse(s.attributes.finishes_at) - Date.now()) / 1000) + total(data.duration);
          return this.update(id, 'active', { finishes_at: finish(left), duration: fmt(Math.max(total(s.attributes.duration), left)) });
        }
        return this.update(id, 'idle', { finishes_at: undefined, remaining: undefined });
      }
      case 'alarm_control_panel': {
        if (service === 'alarm_disarm') {
          if (data.code !== '1234') throw new Error('暗証番号が違います');
          return this.update(id, 'disarmed', { changed_by: 'ダッシュボード' });
        }
        const mode = service.replace('alarm_arm_', 'armed_');
        this.update(id, 'arming');
        setTimeout(() => (this.update(id, mode, { changed_by: 'ダッシュボード' }), this.emit()), 2000);
        return;
      }
      case 'update':
        if (service === 'install') {
          this.update(id, undefined, { in_progress: true });
          setTimeout(() => (this.update(id, 'off', { in_progress: false, installed_version: s.attributes.latest_version }), this.emit()), 2500);
        }
        return;
      case 'cover': {
        if (service === 'set_cover_tilt_position') return this.update(id, undefined, { current_tilt_position: Number(data.tilt_position) });
        if (service === 'open_cover_tilt') return this.update(id, undefined, { current_tilt_position: 100 });
        if (service === 'close_cover_tilt') return this.update(id, undefined, { current_tilt_position: 0 });
        if (service === 'stop_cover_tilt') return;
        if (service === 'stop_cover') return this.stopCover(id);
        const target =
          service === 'set_cover_position' ? Number(data.position) : service === 'open_cover' || (service === 'toggle' && s.state !== 'open') ? 100 : 0;
        return this.moveCover(id, target);
      }
      case 'scene':
      case 'button':
      case 'input_button':
        return this.update(id, iso());
      case 'script':
        this.update(id, 'on', { last_triggered: iso() });
        setTimeout(() => (this.update(id, 'off'), this.emit()), 1500);
        return;
      case 'lock': {
        if (s.attributes.code_format && data.code !== '1234') throw new Error('暗証番号が違います');
        const after = (ms: number, state: string) =>
          setTimeout(() => {
            this.update(id, state, { changed_by: 'ダッシュボード' });
            this.emit();
          }, ms);
        if (service === 'open') {
          this.update(id, 'opening');
          after(1200, 'open');
          after(5000, 'unlocked');
          return;
        }
        const lock = service === 'lock' || (service === 'toggle' && s.state !== 'locked');
        this.update(id, lock ? 'locking' : 'unlocking');
        after(1500, lock ? 'locked' : 'unlocked');
        return;
      }
      case 'binary_sensor':
        // Preview only: clicking a sensor's more-info is not a service; see __hass.flip().
        return;
      case 'climate': {
        const a = s.attributes;
        const actionFor: Record<string, string> = { heat: 'heating', cool: 'cooling', dry: 'drying', fan_only: 'fan', auto: 'heating', off: 'off' };
        switch (service) {
          case 'set_hvac_mode':
            return this.update(id, String(data.hvac_mode), { hvac_action: actionFor[String(data.hvac_mode)] });
          case 'turn_on': {
            const mode = (a.last_mode as string) ?? (a.hvac_modes as string[]).find((m) => m !== 'off') ?? 'auto';
            return this.update(id, mode, { hvac_action: actionFor[mode] });
          }
          case 'turn_off':
            return this.update(id, 'off', { hvac_action: 'off', last_mode: s.state });
          case 'toggle':
            return this.handle(d, s.state === 'off' ? 'turn_on' : 'turn_off', id, data);
          case 'set_temperature':
            return data.target_temp_low !== undefined
              ? this.update(id, undefined, { target_temp_low: data.target_temp_low, target_temp_high: data.target_temp_high })
              : this.update(id, undefined, { temperature: data.temperature });
          case 'set_preset_mode':
            return this.update(id, undefined, { preset_mode: data.preset_mode });
          case 'set_fan_mode':
            return this.update(id, undefined, { fan_mode: data.fan_mode });
          case 'set_swing_mode':
            return this.update(id, undefined, { swing_mode: data.swing_mode });
          case 'set_swing_horizontal_mode':
            return this.update(id, undefined, { swing_horizontal_mode: data.swing_horizontal_mode });
        }
        return;
      }
      case 'media_player': {
        const a = s.attributes;
        const pos = () => {
          let p = Number(a.media_position ?? 0);
          if (s.state === 'playing') p += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
          return Math.min(p, Number(a.media_duration));
        };
        switch (service) {
          case 'media_play_pause':
            return this.update(id, s.state === 'playing' ? 'paused' : 'playing', { media_position: pos(), media_position_updated_at: iso() });
          case 'media_next_track':
          case 'media_previous_track': {
            const titles = ['Evening Lo-fi', 'Rainy Window', 'Slow Morning', 'Night Drive'];
            const i = titles.indexOf(a.media_title);
            const next = titles[(i + (service === 'media_next_track' ? 1 : titles.length - 1)) % titles.length];
            return this.update(id, 'playing', { media_title: next, media_position: 0, media_position_updated_at: iso() });
          }
          case 'media_seek':
            return this.update(id, undefined, { media_position: Number(data.seek_position), media_position_updated_at: iso() });
          case 'shuffle_set':
            return this.update(id, undefined, { shuffle: data.shuffle });
          case 'repeat_set':
            return this.update(id, undefined, { repeat: data.repeat });
          case 'turn_off':
            return this.update(id, 'off');
          case 'turn_on':
            return this.update(id, a.device_class === 'tv' ? 'on' : 'paused');
          case 'volume_set':
            return this.update(id, undefined, { volume_level: data.volume_level, is_volume_muted: false });
          case 'volume_up':
          case 'volume_down': {
            const v = Number(a.volume_level ?? 0) + (service === 'volume_up' ? 0.05 : -0.05);
            return this.update(id, undefined, { volume_level: Math.min(1, Math.max(0, v)) });
          }
          case 'volume_mute':
            return this.update(id, undefined, { is_volume_muted: data.is_volume_muted });
          case 'select_source':
            return this.update(id, undefined, { source: data.source, app_name: data.source });
          case 'join': {
            const members = [...new Set([...(a.group_members ?? [id]), ...(data.group_members as string[])])];
            for (const m of members) this.update(m, undefined, { group_members: members });
            return;
          }
          case 'unjoin': {
            for (const [mid, m] of Object.entries(this.states)) {
              if (mid.startsWith('media_player.') && (m.attributes.group_members ?? []).includes(id)) {
                this.update(mid, undefined, { group_members: (m.attributes.group_members as string[]).filter((x) => x !== id) });
              }
            }
            return this.update(id, undefined, { group_members: [] });
          }
        }
      }
    }
  }
}
