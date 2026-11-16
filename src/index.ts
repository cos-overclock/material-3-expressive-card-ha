import './cards/heading-card';
import './cards/hero-card';
import './cards/tile-card';
import './cards/light-card';
import './cards/climate-card';
import './cards/scenes-card';
import './cards/media-card';
import './cards/cover-card';
import './cards/alarm-card';
import './cards/sensor-card';
import './cards/water-heater-card';
import './cards/camera-card';
import './cards/energy-card';
import './cards/energy-flow-card';
import './cards/energy-sankey-card';
import './cards/badges-card';
import './cards/lock-card';
import './cards/presence-card';
import './cards/vacuum-card';
import './cards/laundry-card';
import './cards/garbage-card';
import './cards/agenda-card';
import './cards/value-card';
import './cards/fan-card';
import './cards/control-card';
import './cards/area-card';
import './cards/maintenance-card';
import './cards/remote-card';
import './cards/timer-card';
import './cards/weather-card';
import { SUGGESTIONS, type EntitySuggestion } from './suggestions';

declare global {
  interface Window {
    customCards?: {
      type: string;
      name: string;
      description: string;
      preview?: boolean;
      /** HA 2026.6+: card picker suggestion for a picked entity. */
      getEntitySuggestion?: EntitySuggestion;
    }[];
  }
}

/** From package.json at build time (vite `define`). */
const VERSION = __M3E_VERSION__;

const CARDS = [
  ['m3e-heading-card', 'M3E 見出し', 'セクション見出し。アイコン・タイトル・センサー値'],
  ['m3e-hero-card', 'M3E 時計と天気', '日付・時計・在宅状況・天気と週間予報'],
  ['m3e-tile-card', 'M3E タイル', 'オン/オフの切り替えや、シーン・スクリプト・ボタンの実行。2行・1行・ミニ'],
  ['m3e-light-card', 'M3E ライト', '明るさスライダー／カラー／色温度の3レイアウト'],
  ['m3e-climate-card', 'M3E エアコン', '設定温度・運転モード・風量と風向'],
  ['m3e-scenes-card', 'M3E シーン', 'シーン・スクリプトのボタン列'],
  ['m3e-media-card', 'M3E メディア', '再生中の曲と操作ボタン、波形プログレス'],
  ['m3e-cover-card', 'M3E カーテン・シェード', '窓のイラスト・開き具合のスライダー・開閉ボタン、または1行の ▲ ■ ▼'],
  ['m3e-alarm-card', 'M3E 警備', '警備状態（在宅・外出・警報など）を色とシェイプで'],
  ['m3e-sensor-card', 'M3E センサー', '値と過去24時間のグラフ（大きい表示・小さい表示）'],
  ['m3e-water-heater-card', 'M3E 給湯', '給湯・ふろの温度、お湯はりの進み具合、ふろ自動などのボタン'],
  ['m3e-camera-card', 'M3E カメラ', 'ライブ映像・検知イベント・スナップショット、またはサムネイル'],
  ['m3e-energy-card', 'M3E エネルギー', '現在の消費電力・太陽光・蓄電池・売電と、時間ごとの消費と供給'],
  ['m3e-energy-flow-card', 'M3E エネルギーの流れ', '太陽光・電力会社・蓄電池から家への流れと自給率'],
  ['m3e-energy-sankey-card', 'M3E エリア・デバイス別', '供給元 → エリア → デバイスのサンキー図（日・週・月）'],
  ['m3e-badges-card', 'M3E バッジ', 'ページ上部のバッジ。エンティティの状態や件数・平均'],
  ['m3e-presence-card', 'M3E 家族', '在宅・外出・帰宅中（移動時間つき）'],
  ['m3e-vacuum-card', 'M3E ロボット掃除機', '掃除の進み具合・部屋の指定・一時停止と充電台へ'],
  ['m3e-laundry-card', 'M3E 洗濯機', '終了予定・工程・消費電力・終わったら知らせる'],
  ['m3e-garbage-card', 'M3E ゴミ出し', '次の収集日と「出した」ボタン、その先の予定'],
  ['m3e-agenda-card', 'M3E 予定と買い物リスト', 'カレンダーの予定と、チェックできる To-do リスト'],
  ['m3e-lock-card', 'M3E 鍵', '長押しで解錠・タップで施錠。暗証番号のテンキー、ドアを開けるボタン。1行表示も'],
  ['m3e-value-card', 'M3E 値', 'Bool（オン/オフ・開/閉など）や数値をそのまま表示する小さなカード。1/3 幅のミニ表示も'],
  ['m3e-fan-card', 'M3E 扇風機・空気清浄機・加湿器', '風量・モード・首振り、加湿器は目標湿度'],
  ['m3e-control-card', 'M3E 選択・数値', 'select の選択肢をボタンで、number の値をスライダーや −/＋ で'],
  ['m3e-area-card', 'M3E 部屋', 'エリアの温度・湿度、点灯中の照明、人感・窓・エアコンをひと目で'],
  ['m3e-maintenance-card', 'M3E メンテナンス', '電池残量の少ない機器・アップデート・利用できないエンティティ'],
  ['m3e-remote-card', 'M3E テレビのリモコン', '方向キー・戻る・ホーム・音量・チャンネル・入力の切り替え'],
  ['m3e-timer-card', 'M3E タイマー', 'タイマーの残り時間、スタート・一時停止、すぐ始めるプリセット'],
  ['m3e-weather-card', 'M3E 天気', '今の天気、1時間ごと・日ごとの予報'],
] as const;

window.customCards = window.customCards ?? [];
for (const [type, name, description] of CARDS) {
  if (!window.customCards.some((c) => c.type === type)) {
    window.customCards.push({ type, name, description, preview: true, getEntitySuggestion: SUGGESTIONS[type] });
  }
}

console.info(`%c MATERIAL 3 EXPRESSIVE CARD %c ${VERSION} `, 'background:#8839EF;color:#fff;border-radius:4px 0 0 4px;padding:2px 4px', 'background:#E6E9EF;color:#4C4F69;border-radius:0 4px 4px 0;padding:2px 4px');
