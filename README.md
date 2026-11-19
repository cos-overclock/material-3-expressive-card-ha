# Material 3 Expressive Card

配色は Catppuccin の Latte（ライト）と Mocha（ダーク）で、動きは Material 3 Expressive のモーションに合わせています。

## 使い方

```sh
npm install
npm run dev     # プレビュー（モックの HA）を http://localhost:5173/preview/ で開く
npm test        # テスト（表示の書式・集計などの単体テストと、カードの操作テスト）
npm run build   # 型チェックとテストのあと、dist/material-3-expressive-card.js を作る
```

カードの操作テスト（`tests/cards/`、`tests/components/`）は happy-dom の上でカードを表示し、設定の変更、通信の失敗、キーボード操作を確かめます。プルリクエストと `main` への push では、GitHub Actions（`.github/workflows/ci.yml`）が型チェック、テスト、ビルドを実行し、バンドルのサイズをジョブの概要に書き出します。

プレビューのツールバーの「通信失敗」にチェックを入れる（または URL に `?offline` を付ける）と、履歴・統計・予定・予報の読み込みが失敗します。失敗の表示と［再試行］を確かめるときに使います。

### Home Assistant への組み込み

1. `npm run build` で作った `dist/material-3-expressive-card.js` を `<config>/www/` にコピーします。
2. 「設定 → ダッシュボード → リソース」で `/local/material-3-expressive-card.js` を **JavaScript モジュール**として追加します。
3. ダッシュボードの周りの色も合わせる場合は、`themes/m3e-catppuccin.yaml` をテーマとして読み込みます。

カードは HA のダークモードに合わせて Latte と Mocha を自動で切り替えます。どちらかに固定したいときは `theme: latte` か `theme: mocha` を指定します。

#### HACS で配布する

リポジトリのルートに `hacs.json` があり、HACS の「カスタムリポジトリ」（種類は Dashboard）として追加できます。`v` で始まるタグをプッシュすると、`.github/workflows/release.yml` が `dist/material-3-expressive-card.js` をビルドし、それを添付した GitHub リリースを作ります。タグは `package.json` の `version` に `v` を付けたもの（例 `v0.2.0`）にします。一致しないとワークフローは失敗します。`v0.3.0-beta.1` のようにハイフンを含むタグはプレリリースになります。

```sh
git tag v0.2.0
git push origin v0.2.0
```

ブラウザのコンソールに出るバージョンも `package.json` から入ります。

#### フォント

カードは Google Fonts から Google Sans Flex と Noto Sans JP を読み込みます。インターネットにつながらない環境や、外部に通信したくない場合は、HA のテーマに `m3e-fonts` を加えます。

```yaml
m3e-fonts: none                       # 読み込まない（システムのフォントで表示）
m3e-fonts: /local/fonts/m3e-fonts.css # 自分で置いた @font-face の CSS を読み込む
```

#### カード追加時の候補

HA 2026.6 以降では、「カードを追加」でデバイスやエンティティを選ぶと、そのエンティティに合う M3E カードが「コミュニティ」の欄に候補として表示されます。レイアウトが複数あるカードは、レイアウトごとに候補が出ます。

| 選んだエンティティ | 候補に出るカード |
| --- | --- |
| `light` | ライト、タイル（2行・1行・ミニ） |
| `switch` `fan` `input_boolean` `humidifier` `automation` `button` `input_button` | タイル（2行・1行・ミニ） |
| `scene` `script` | タイル（2行・1行・ミニ）、シーン |
| `climate` / `media_player` / `alarm_control_panel` / `vacuum` / `water_heater` | エアコン / メディア / 警備 / ロボット掃除機 / 給湯 |
| `cover` / `lock` / `camera` | カーテン・シェード / 鍵 / カメラ（それぞれ通常と 1 行・サムネイル） |
| 数値の `sensor` | センサー（グラフつき・小さい表示）、値（2行・1行・ミニ） |
| `binary_sensor`、数値の `number` `input_number` | 値（2行・1行・ミニ） |
| 洗濯機らしい `sensor` `select`（ID か名前に washer・laundry・洗濯など） | 洗濯機 |
| `weather` | 時計と天気（通常・フッター） |
| `calendar` `todo` / `person` | 予定と買い物リスト / 家族 |
| `fan` `humidifier` | 扇風機・空気清浄機・加湿器 |
| `select` `input_select` `number` `input_number` | 選択・数値（通常・1行） |
| `remote`、`device_class: tv` の `media_player` | テレビのリモコン |
| `timer` | タイマー |
| `weather` | 天気（時計と天気に加えて） |
| `alarm_control_panel` | 警備（通常・開始/解除ボタンつき） |

### スマートフォン・タブレットでのコンパクト表示

スマートフォンやタブレットで開くと、カードは自動でコンパクト表示になります。余白と文字を小さくし、大きな数字やボタンも一回り小さくするので、1枚のカードが画面を占めなくなります。おもな変化は次のとおりです。

- 時計と天気（hero）は、時計と今の天気を横に並べます。高さはおよそ半分になります。
- タイルは1行（高さ 56px）になり、スイッチを省きます。タイル自体をタップすると切り替わります。スイッチも出したいときは `show_switch: true` を指定します。
- エアコンは室温と湿度のチップを状態の行（「暖房中・室温 21.8°・湿度 45%」）にまとめます。

コンパクト表示になるのは、画面の幅が 1024px 以下のとき、またはタッチ操作が主の端末（`pointer: coarse`）のときです。カードごとに切り替えたいときは `density` を指定します。

```yaml
density: auto         # 既定。スマホ・タブレットでコンパクト、PC では標準
density: compact      # いつもコンパクト
density: comfortable  # いつも標準（壁掛けタブレットで大きく見せたいときなど）
```

すべてのカードをまとめて固定したいときは、HA のテーマに `m3e-density: compact`（または `comfortable`）を加えます。`density: auto` のカードはテーマの値に従い、カードの `density` を指定していればそちらが優先されます。

### カテゴリでまとめる

カードは1枚で1つのものを操作します。カーテンやセキュリティのように複数のものをひとまとまりで見せたいときは、セクション（HA のセクション表示の1列）に見出しカードを置き、その下に各カードを並べます。見出しの `summary` で、まとめた全体の状態（「2か所が開」「すべて正常」など）を出せます。

一番よく使うものは大きな表示（`full`）にし、残りは1行の表示（`compact` や `row`）にすると、一覧として読みやすくなります。

ドアの開閉や消費電力のような値、シーンやスクリプトのボタンをたくさん並べたいときは、`layout: mini` を使います。値カードとタイルカードが高さ 56px・セクションの 1/3 幅になり、1行に3枚並びます。

```yaml
# セクション「ひと目で」
cards:
  - { type: custom:m3e-heading-card, title: ひと目で, icon: sensors }
  - { type: custom:m3e-value-card, entity: binary_sensor.back_door, layout: mini }     # 勝手口 閉
  - { type: custom:m3e-value-card, entity: sensor.home_power, layout: mini }           # 消費電力 1.24 kW
  - { type: custom:m3e-value-card, entity: sensor.front_door_lock_battery, layout: mini, min: 0, max: 100 }
  - { type: custom:m3e-tile-card, entity: script.all_lights_off, layout: mini }        # 押すと実行
  - { type: custom:m3e-tile-card, entity: input_boolean.laundry_notify, layout: mini } # 押すと切り替え
  - { type: custom:m3e-tile-card, entity: scene.good_night, layout: mini, grid_options: { columns: 3 } }  # アイコンだけ
```

```yaml
# セクション「カーテン・シェード」
cards:
  - type: custom:m3e-heading-card
    title: カーテン・シェード
    icon: roller-shades-closed
    summary: { type: count, entities: [cover.living_curtain, cover.bedroom_screen, cover.study_blind], state: [open, opening], text: '{n}か所が開', zero_text: すべて閉 }
  - type: custom:m3e-cover-card
    entity: cover.living_curtain               # 大きく
  - type: custom:m3e-cover-card
    entity: cover.bedroom_screen
    layout: compact                            # 1行
  - type: custom:m3e-cover-card
    entity: cover.study_blind
    layout: compact
```

```yaml
# セクション「セキュリティ」
cards:
  - type: custom:m3e-heading-card
    title: セキュリティ
    icon: shield
    summary: { type: count, entities: [lock.front_door, binary_sensor.back_door, binary_sensor.living_window], state: [unlocked, 'on', open], text: '{n}件を確認', zero_text: すべて正常 }
  - type: custom:m3e-alarm-card
    entity: alarm_control_panel.home
  - type: custom:m3e-lock-card
    entity: lock.front_door
    layout: compact
  - { type: custom:m3e-value-card, entity: binary_sensor.back_door, layout: row }
  - { type: custom:m3e-value-card, entity: binary_sensor.living_window, layout: row }
```

## カード一覧

すべてのカードで `color`（アクセント色）、`theme`、`density`（[コンパクト表示](#スマートフォンタブレットでのコンパクト表示)）を指定できます。

### 操作（`tap_action`・`hold_action`・`double_tap_action`）

HA 標準のカードと同じ書き方で、タップ・長押し・ダブルタップの動作を変えられます。`toggle`・`more-info`・`none` に加えて、`navigate`・`url`・`perform-action`・`assist` と `confirmation`（確認ダイアログ）も使えます。編集画面では「操作」の折りたたみ項目から選べます。

```yaml
type: custom:m3e-tile-card
entity: light.kitchen
tap_action: { action: toggle }
hold_action: { action: more-info }
double_tap_action:
  action: perform-action
  perform_action: script.kitchen_bright
  confirmation: { text: 全部明るくしますか？ }
```

- カード全体が1つのボタンになっているカード（タイル・ライト・値・警備）は、3種類すべてに対応します。ダブルタップを待つのは、`double_tap_action` を書いたときだけです。書かなければタップはすぐに反応します。
- 操作部がたくさんあるカード（エアコン・カーテン・鍵・メディア・センサーなど）は、見出し（アイコンと名前）をタップしたときの `tap_action` に対応します。省略すると、これまでどおり詳細ダイアログを開きます。
- 見出しカードは `tap_action` で好きなページへ移動できます（従来の `navigation_path` も使えます）。

キーボードでは Enter / Space がタップ、Shift+Enter（またはコンテキストメニューキー）が長押しです。HA のスマホアプリでは、切り替えや長押し、解錠などで端末が振動します。

### エンティティが見つからないとき

`entity` に書いたエンティティが HA にないときは、カードの代わりに赤い警告（「エンティティが見つかりません」とエンティティ ID）を表示します。名前を変えたときや、統合を削除したときに気づけます。

### データの取得状態

履歴や統計などを HA から読み込むカード（センサー、エネルギー3種、予定と買い物リスト、ゴミ出しのカレンダー連携、天気の予報）は、読み込みの状態をカードの中に出します。

- 読み込み中は「読み込み中…」、読み込んだあとは「14:40 更新」のように最後に読み込んだ時刻を出します（センサーは見出しの下、ほかのカードは下端）。
- 読み込めたが中身がないときは「履歴なし」「今日の記録はまだありません」などと出します。
- 読み込めなかったときは、赤い行に「履歴を取得できませんでした」と［再試行］ボタンを出します。前に読み込んだデータが残っていれば、それを表示したまま「14:00 時点のデータを表示しています」と添えます。小さい表示のセンサーでは、名前の横のアイコンが［再試行］ボタンです。

これで「データがない」のか「取得に失敗した」のかを見分けられます。

### 設定の確認

編集画面では、入力中の設定を確かめて、問題があればフォームの上に一覧で出します。

- **赤（エラー）**：このままではカードが動きません。カードは HA のエラー表示になり、該当する欄の下にも理由を出します。例：グラフの時間（`hours`）が 0 や文字列、小数点以下の桁数（`decimals`）が負の数や小数、`domain` に `light.living` のようなエンティティ ID を書いた、鍵カードに鍵以外のエンティティを選んだ、ゴミ出しの日付が `2026-02-30`、締め切り時刻が `8時`。
- **黄（注意）**：カードは動きますが、意図どおりでない可能性があります。例：値の段階（`levels`）の上限が小さい順になっていない、最後以外の段階に上限がない。

YAML で書いた設定も同じ基準で確かめます。エラーのときは HA のエラー表示に英語の理由（`hours must be a number from 1 to 8760` など）が出ます。

### 画面に出ていないとき

ブラウザのタブが裏にあるあいだや、スクロールして画面の外に出ているあいだは、カメラの静止画の読み直し、時計、メディアの再生位置と波形、グラフの読み直しを止めます。画面やタブに戻るとすぐに最新の状態に更新します。エネルギー・予定・シーン・タイルの「〇分前」などは1分ごとに表示を更新し、エネルギーと予定は決まった間隔でデータを読み直します。

### 編集画面のリスト

シーン、家族、予定のカレンダー、ゴミ出しの収集日、掃除の部屋、バッジ、カメラの検知イベント、給湯のボタンなどのリストは、編集画面で1件ずつフォームで追加・編集できます。以前は YAML の入力欄でした。`[person.yuki]` のように ID だけで書いた項目も、そのまま編集できます。

### アクセントカラー（`color`）

`color` には Catppuccin の14色のアクセントを指定できます。

`rosewater` `flamingo` `pink` `mauve` `red` `maroon` `peach` `yellow` `green` `teal` `sky` `sapphire` `blue` `lavender`

省略すると、カードごとの既定の色を使います。カードの編集画面（ビジュアルエディタ）では、カード固有の項目の下に色見本が並びます。色見本は今のテーマ（Latte / Mocha）の色で表示し、選んだ色が両方のテーマでどう見えるかを下の見本で確認できます。「自動」を選ぶと `color` を消します。

エアコンと照明のカードは、運転モードや照明の色に合わせて色が変わるため、編集画面に色見本を出しません。照明カードの `color` は、照明の色が取れないときの予備の色として、これまでどおりフォームの選択肢で指定できます。

状態を表す色（警報の赤、解錠のオレンジ、在宅の緑など）は `color` を指定しても変わりません。カードによって `color` が変える部分は次のとおりです。

| カード | `color` が変える部分 |
| --- | --- |
| 見出し | アイコン |
| 時計と天気 | 天気の表示（在宅のチップと週間予報のアイコンは変わらない） |
| 警備 | 警備中の色（開始中・まもなく警報の黄、警報の赤、オフの無彩色は変わらない） |
| 鍵 | 暗証番号のテンキーの決定ボタン |
| バッジ | 色を指定していないバッジのうち、ドメインやデバイスクラスから色が決まらないもの |
| シーン・家族・予定 | 色を指定していないシーン・人・カレンダー（予定は To-do リストも） |
| ゴミ出し | 色を指定していない種類（名前から決まる色の代わりに使う） |
| エネルギー | 消費電力のアイコン（太陽光・蓄電池・買電のタイルとグラフは変わらない） |
| エネルギーの流れ | 自給率の表示 |
| エリア・デバイス別 | 見出しのアイコンと期間の切り替えボタン（グラフは変わらない） |
| そのほか | カード全体のアクセント |

### `custom:m3e-heading-card` 見出し

```yaml
type: custom:m3e-heading-card
title: リビング
icon: chair
entities: [sensor.living_temperature, sensor.living_humidity]   # 右側に「21.8° · 45%」
```

右側の値は表示精度（エンティティの設定の「表示精度」）に合わせて丸めます。°F のセンサーは「70.2°F」のように単位を付けます。

`{entity, name}` と書くと値の前に名前が付きます（「浴室 24.5°」）。右側にはいくつかのエンティティを数えた結果も出せます。

```yaml
type: custom:m3e-heading-card
title: カーテン・シェード
icon: roller-shades-closed
summary:                 # 「2か所が開」。0件なら「すべて閉」
  type: count
  entities: [cover.living_curtain, cover.bedroom_screen, cover.study_blind]
  state: [open, opening] # 省略すると、オン・開・解錠などの「動いている」状態を数える
  text: '{n}か所が開'
  zero_text: すべて閉
```

`text` では `{n}`（当てはまる数）のほかに `{rest}`（状態がわかっていて当てはまらない数）、`{unknown}`（見つからない・利用不可・不明の数）、`{total}`（全体の数）も使えます（例：`在宅 {n}人・外出 {rest}人`）。

状態がわからないエンティティ（存在しない、`unavailable`、`unknown`）は、当てはまる数にも当てはまらない数にも入れません。1つでもあれば「1件不明」のように書き足し、`zero_text` は出しません。通信できない鍵があるのに「すべて正常」と出ることはありません。書き足す文言は `unknown_text` で変えられます（既定は `{unknown}件不明`）。`text` に `{unknown}` を入れた場合は書き足しません。`summary: { type: date }` と書くと、今日の日付（「11月13日（金）」）を出します。

`collapsible: true` を付けると、見出しをタップして次の見出しまでのカードを折りたためます（編集モード中は自動で開きます）。開閉状態は `collapse_memory`（`device` / `user` / `session`）または `collapse_entity`（`input_boolean` 等）で保存できます。`action: { name: 全消灯, icon: power-settings-new, tap_action: ... }` で右側にクイックアクションボタンも置けます。

### `custom:m3e-hero-card` 時計と天気

```yaml
type: custom:m3e-hero-card
weather: weather.home
subtitle: 玄関は施錠済み・窓はすべて閉
# title を省略すると「照明N つ点灯中」を自動で表示
```

`layout: footer` にすると、時計と天気を高さ 120px（セクションの2行分）のバーにまとめます。セクション表示の「フッター」（画面の下に固定されるカード）に置くためのレイアウトです。

```yaml
# ビューの設定（ビューを編集 → フッター、または YAML の views[] の中）
footer:
  card:
    type: custom:m3e-hero-card
    layout: footer
    weather: weather.home
    forecast_days: 3   # バーの幅が 540px 以上のときだけ表示（既定 3）
```

`forecast_type: hourly` にすると、日ごとの代わりに1時間ごとの予報（「15時」）を並べます。数は `forecast_days` で指定します。

左に日付・時計・`subtitle`（なければ `title`、それもなければ「照明N つ点灯中」）を縦に並べ、右に今の天気（気温・天気・最高/最低）を出します。天気をタップすると詳細ダイアログが開きます。バーが狭いときは、540px 未満で予報を、360px 未満で日付の月と最高/最低を省きます。フッターでは HA がカードに影を付けます。

### `custom:m3e-tile-card` タイル（2行、184×120）

```yaml
type: custom:m3e-tile-card
entity: switch.dishwasher
icon: dishwasher
color: teal
state_text_on: 運転中
secondary_entity: sensor.dishwasher_remaining   # 「運転中・残り 42分」
secondary_prefix: '残り '
```

タップで切り替え、長押しで詳細ダイアログを開きます（`tap_action` / `hold_action` で変更可）。コンパクト表示では1行（高さ 56px）のタイルになり、スイッチを省きます。

`layout` で大きさを固定できます。

| `layout` | 大きさ |
|---|---|
| `auto`（既定） | 標準では `tile`、コンパクト表示では `row` |
| `tile` | 2行、セクションの半分の幅 |
| `row` | 1行（56px）、セクションの半分の幅 |
| `mini` | 1行（56px）、セクションの 1/3 の幅。シェイプを小さくし、スイッチは出しません。幅を3列（1/4）まで縮めるとアイコンだけのボタンになります |

`scene`・`script`・`button`・`input_button` は、押すと実行するボタンとして表示します。押すと少しのあいだシェイプが変形して色が付き、状態の行には前回実行した時刻（「3分前」）を出します。実行中のスクリプトは「実行中」と表示します。スイッチは出しません。アイコンは `icon` を省略するとエンティティのアイコンを使います。

### `custom:m3e-light-card` ライト

```yaml
type: custom:m3e-light-card
entity: light.bed_light
layout: color        # slider（既定）| color | temperature | full | auto
color: pink
presets:             # color レイアウトの色プリセット（省略可）
  - { color: '#FF6FC4', name: ローズピンク }
temperature_presets: # temperature レイアウトのプリセット（省略可）
  - { kelvin: 2700, name: 電球色 }
show_brightness: true     # 明るさスライダー
show_presets: true        # カラー・色温度のプリセット
show_color_sliders: true  # 色相・彩度・色温度のスライダー
```

`show_*` はどれも省略時は `true` で、`false` にした操作部だけ消えます。すべて `false` にすると、名前とスイッチだけの1行のカードになります。`full` レイアウトでプリセットと色のスライダーを両方消すと、「カラー / 色温度」の切り替えボタンも消えます。

`color`・`temperature`・`full` レイアウトではカード全体を着色しません。エアコンカードと同じく背景はニュートラルな色のままにし、アイコンのシェイプ、状態テキスト、スイッチ、明るさスライダーを照明の今の色に合わせます。色は Latte では濃いめ、Mocha ではパステルに調整するので、どの色でも文字やアイコンが読めます。色相・彩度スライダーや色温度スライダーをドラッグしている間も色が追従します。色温度の色は色温度スライダーと同じグラデーションから取ります。電球色はオレンジ、昼白色はニュートラルグレー、昼光色は青みになります。`color` オプションは、照明の色が取れないときの予備の色として使います。

`full` レイアウトはフルカラーと色温度の両方に対応した照明向けです。明るさスライダーを上に置き、その下の「カラー / 色温度」のボタンで操作部を切り替えます。切り替えるとパネルが横にスライドし、高さはスプリングで変わります。最初に開くタブは照明の今の `color_mode` に合わせ、ほかの画面で照明の色の種類が変わると、それに合わせてタブも切り替わります。タブを切り替えるだけでは照明に命令を送りません。照明が切り替わるのは、プリセットやスライダーを操作したときです。色の同期は `color` レイアウトと同じです。

照明がエフェクト（`effect_list`）を持っていれば、`color`・`temperature`・`full` レイアウトの下に「エフェクト」のチップを出します。タップすると一覧が開き、選ぶとそのエフェクトでつけます。`show_effects: false` で消せます。

`auto` を指定すると、照明の `supported_color_modes` から自動で選びます。両方に対応していれば `full`、カラーだけなら `color`、色温度だけなら `temperature`、どちらもなければ `slider` です。

### `custom:m3e-climate-card` エアコン

```yaml
type: custom:m3e-climate-card
entity: climate.living_ac
expanded: false      # 風量・風向パネルを最初から開くか
show_fan_panel: true # 風量・風向パネル全体を表示するか（false で非表示）
show_fan_mode: true              # 風量
show_swing_mode: true            # 風向（上下）
show_swing_horizontal_mode: true # 風向（左右）
vertical_vanes:      # 上下風向のボタンを明示したい場合（省略時は swing_modes から自動）
  - { mode: swing, label: スイング }
  - { mode: '1', angle: 0 }
  - { mode: '5', angle: 90 }
```

運転モードによってカード全体の色が変わります（暖房 peach、冷房 blue、除湿 teal、送風 green、自動 lavender）。また `hvac_action` に応じて、実際に暖房・冷房中のときは内側の枠が発光し、設定温度に達して待機中（`idle`）のときは控えめな表示になります（`show_activity_glow: false` で枠の発光を消せます）。

運転モードが `heat_cool` で、エアコンに下限と上限の温度（`target_temp_low`・`target_temp_high`）があるときは、「暖房（下限）」と「冷房（上限）」の2つの温度をそれぞれの −/＋ で設定します。下限と上限は1刻み以上離れたままにします。

エアコンがプリセット（`preset_modes`：エコ・おやすみ・パワフルなど）を持っていれば、運転モードの下にボタンで並べます。`show_presets: false` で消せます。表示名は `labels: { preset: { boost: 急速 } }` で変えられます。温度の刻みは `target_temp_step` に合わせ、ないときは °C で 0.5、°F で 1 にします。左右の風向は `swing_horizontal_modes`（HA 2024.12 以降）があるときだけ表示します。

風量・風向の各行は、エンティティがその項目に対応しているときだけ表示します。対応していても使わない行は、`show_fan_mode`・`show_swing_mode`・`show_swing_horizontal_mode` を `false` にすると消せます。右上の要約（「自動・スイング・中央」など）からも消えます。風量だけが残ったときは行の見出しを「風量」に、風向だけが残ったときは「風向」にします。表示する行がひとつもなくなると、「風量・風向」の行も消えます。`show_fan_panel: false` は、個別の設定に関係なくパネル全体を消します。

#### 設定エンティティとオート・マニュアル切り替え

風量・風向をエアコンとは別のエンティティで操作する機種では、行ごとに設定エンティティとオート・マニュアル切り替えのエンティティを指定できます。どれも省略でき、省略した行は従来どおりエアコンの `fan_modes`・`swing_modes`・`swing_horizontal_modes` を使います。

```yaml
type: custom:m3e-climate-card
entity: climate.study_ac
fan_mode_entity: select.study_ac_fan_speed                  # 風量の設定
fan_auto_entity: switch.study_ac_fan_auto                   # 風量のオート・マニュアル
swing_mode_entity: select.study_ac_vane_vertical            # 風向（上下）の設定
swing_auto_entity: select.study_ac_vane_mode                # 風向（上下）のオート・マニュアル
swing_horizontal_mode_entity: number.study_ac_vane_horizontal
swing_horizontal_auto_entity: input_boolean.study_ac_vane_horizontal_auto
```

| キー | 使えるドメイン | 扱い |
| --- | --- | --- |
| `*_mode_entity` | `select`・`input_select` | `options` をボタンにし、`select_option` で設定 |
| | `number`・`input_number` | `min`〜`max` を `step` 刻みでボタンにし（12段階まで。超えるとスライダー）、`set_value` で設定 |
| `*_auto_entity` | `switch`・`input_boolean` | オンを自動として扱う |
| | `select`・`input_select` | `auto`・`オート`・`自動` の選択肢を自動、`manual`・`マニュアル`・`手動` の選択肢（なければ自動以外の最初の選択肢）を手動として扱う |

切り替えのエンティティを指定した行は、見出しの右に「自動」スイッチが付きます。自動のあいだはボタンの選択を外し、要約にも「自動」と出します。自動のままボタンを押すと、先に手動へ切り替えてから値を設定します。設定エンティティを指定せず切り替えだけを指定した場合は、エアコン本体の風量・風向のボタンにスイッチが付きます。ボタンがない行でも、切り替えを指定していればスイッチだけの行として表示します。カードの編集画面では風量・風向（上下）・風向（左右）の折りたたみ項目からそれぞれ選べます。

#### ボタンとスライダー

選択肢が多くてボタンが1行に収まらない行は、スライダーで設定します。行ごとに `fan_control`・`swing_control`・`swing_horizontal_control` で切り替えられます。

```yaml
fan_control: auto     # auto（既定）| buttons | slider
swing_control: slider
```

- `auto`：カードの幅とボタンの文字数から、ボタンが収まるかを見積もります。収まらないときだけスライダーにします。カードの幅が変わると選び直します。
- `buttons`：常にボタンにします。ただし、`number` で12段階を超える行はボタンにできないのでスライダーにします。
- `slider`：常にスライダーにします。

スライダーの段階は選択肢を並び順のまま左から割り当てます（「静音・1・2…・パワフル」なら左端が静音）。`auto`・`swing`・`off`・`wide`・`スイング`・`固定` のように段階ではない選択肢は、スライダーの左にボタンとして残します。3つ以上あるときは、ボタンをスライダーの上の行に並べます。`number`・`input_number` の行はエンティティの `min`・`max`・`step` をそのまま使い、値に単位を付けて表示します。

ドラッグ中は見出しの値が追従し、指を離したときに値を送ります。自動のあいだや、段階ではない選択肢を選んでいるあいだは、スライダーをグレーにします。自動のままスライダーを動かすと、ボタンと同じく手動に切り替えてから値を設定します。

### `custom:m3e-scenes-card` シーン

```yaml
type: custom:m3e-scenes-card
title: シーン
scenes:
  - { entity: scene.good_morning, icon: wb-twilight, color: peach }
  - { entity: scene.theater, icon: tv, color: mauve }
```

直近12時間に実行したシーンを塗りつぶして表示します（`active_hours` で変更可）。

### `custom:m3e-media-card` メディア

```yaml
type: custom:m3e-media-card
entity: media_player.living_speaker
device_name: リビング スピーカー
```

プレーヤーがジャケット画像（`entity_picture`）を返すときは、ジャケットをカード全体の背景にうっすら表示し、左上の小さなジャケットは出しません。下へいくほど背景色に溶け込み、操作ボタンが見やすくなります。一時停止中はさらに薄くなります。`show_backdrop: false` を指定すると、背景には出さず、従来どおり左上に小さく表示します。濃さとぼかしは CSS 変数 `--m3e-media-backdrop-opacity`（既定 `0.55`）と `--m3e-media-backdrop-blur`（既定 `0px`）で調整できます。

音量に対応したプレーヤーでは、操作ボタンの下に音量のスライダーとミュートのボタンを出します（音量を段階でしか変えられないプレーヤーは −/＋）。入力（`source_list`）があれば「入力」のチップから切り替えられます。`show_volume: false`・`show_source: false` で消せます。

```yaml
type: custom:m3e-media-card
entity: media_player.living_speaker
group_entities: [media_player.kitchen_speaker, media_player.bedroom_speaker]  # 一緒に再生できるスピーカー
```

`group_entities` に書いたスピーカーはチップで並び、タップするとこのプレーヤーのグループに入ります（`media_player.join`）。グループに入っているチップは色が付き、もう一度タップするとグループから外れます。グループ再生に対応したプレーヤー（Sonos、Music Assistant など）で使えます。

プレーヤーがシークに対応していれば、シークバーをドラッグ（またはタップ）して再生位置を変えられます。ドラッグ中は時間表示が追従し、離したときに `media_player.media_seek` を送ります。フォーカスした状態では ←/→ キーで5秒ずつ、Home/End で先頭/末尾に移動します。

### `custom:m3e-badges-card` バッジ

```yaml
type: custom:m3e-badges-card
badges:
  - { type: count, domain: light, name: 照明, text: '{n}つ点灯中', zero_text: すべて消灯 }
  - { type: average, entities: [sensor.living_temperature, sensor.bedroom_temperature], name: 平均室温, icon: thermometer, color: red }
  - { entity: sensor.home_power, name: 消費電力, color: peach }
  - { entity: lock.front_door, name: 玄関 }
```

ページ上部に並べる、HA 標準と同じ形のバッジです。エンティティをそのまま出すほか、`type: count`（件数）と `type: average`（平均）で複数のエンティティをまとめられます。値が変わると数字が転がって切り替わります。

### `custom:m3e-cover-card` カーテン・シェード

1枚のカードで1つのカーテン（シェード）を操作します。

```yaml
type: custom:m3e-cover-card
entity: cover.living_curtain
layout: full                       # full（既定）| compact（1行）
sky: auto                          # 窓の空：auto（sun.sun に合わせる）| day | night
show_illustration: true
```

`full` は、窓のイラスト、開き具合のスライダー、「開ける・止める・閉める」のボタンを表示します。カーテンは左右から、`device_class` が shade のシェードは上から、blind / shutter は羽根付きで上から閉まります。開閉中は HA から届く位置に合わせてカーテンがバネで動き、スライダーをドラッグしている間も追従します。

羽根の角度を変えられるブラインド（`supported_features` に tilt があるもの）では、`full` に「羽根の角度」の行を出します。スライダーで角度を、左右のボタンで羽根を閉じる・開く（対応していれば止める）を操作します。`show_tilt: false` で消せます。

`compact` は高さ 56px（セクションの1行分）の1行で、アイコン・名前・「エリア・開閉と位置」と ▲ ■ ▼ のボタンを並べます。エリアの代わりに好きな文言を出すときは `secondary` を指定します。

```yaml
type: custom:m3e-cover-card
entity: cover.study_blind
layout: compact
secondary: 書斎      # 省略すると HA のエリア名
```

以前の `entities`（下に並べる行）は廃止しました。複数のカーテンは[カテゴリでまとめる](#カテゴリでまとめる)のように1つずつカードにします。

### `custom:m3e-alarm-card` 警備

```yaml
type: custom:m3e-alarm-card
entity: alarm_control_panel.home
```

警備状態をカード全体の色とシェイプで表示します。警備中は緑、開始中・まもなく警報は黄、警報中は赤、警備オフは無彩色です。下の行には名前と、その状態になった時刻（わかれば操作した人も）を出します。タップすると HA の詳細ダイアログが開き、そこで警備の開始・解除ができます。

```yaml
type: custom:m3e-alarm-card
entity: alarm_control_panel.home
show_actions: true                 # カードに開始・解除のボタンを出す
modes: [arm_home, arm_away, arm_night]   # 開始ボタンの種類（省略すると対応するすべて）
```

`show_actions: true` にすると、警備オフのときは「在宅・外出・就寝・長期不在」の開始ボタンを、警備中は「警備を解除」のボタンを出します。暗証番号が必要なパネル（`code_format` があるもの）では、カードの中にテンキーが開きます。鍵のカードと同じテンキーです。開始に暗証番号が要らないパネル（`code_arm_required: false`）では、開始はすぐに実行します。番号が違うと HA のエラーを出し、テンキーが揺れます。

### `custom:m3e-lock-card` 鍵

```yaml
type: custom:m3e-lock-card
entity: lock.front_door
door_entity: binary_sensor.front_door_contact   # ドアの開閉（チップに表示）
battery_entity: sensor.front_door_lock_battery  # 電池残量（20% 以下で色付き）
hold_to_unlock: true   # 長押しで解錠（既定）。false にすると2回タップで解錠
hold_time: 800         # 長押しの時間（ms）
show_open: true        # 「ドアを開ける」に対応した錠ならボタンを表示
# code: '1234'         # 毎回同じ暗証番号を送る場合のみ。省略するとカードのテンキーで入力
```

大きなボタンひとつで操作します。施錠中は押し続けるとアイコンの周りのリングが満ち、満ちたところで解錠します。途中で離すとリングはバネで戻り、何も送りません。解錠中・ドアが開いている・動作不良のときは、1回のタップで施錠します。

錠に暗証番号が必要なとき（`code_format` があるとき）は、操作するとカードの中にテンキーが開きます。番号が違うと HA のエラーを表示し、入力欄が揺れます。「ドアを開ける」（ラッチ解除）は誤操作を防ぐため2回タップで実行します。最後に操作した人（`changed_by`）がわかる錠では、それもチップに出します。

`layout: compact` にすると、高さ 56px の1行（アイコン・名前・状態と時刻・「施錠／解錠」ボタン）になります。施錠は1回のタップで、解錠は3秒以内にもう一度タップすると実行します。暗証番号が必要な錠は、HA の詳細ダイアログを開きます。`door_entity`・`battery_entity`・`show_open` は `full` でだけ使います。

```yaml
type: custom:m3e-lock-card
entity: lock.front_door
layout: compact
```

### `custom:m3e-sensor-card` センサー（グラフ）

```yaml
type: custom:m3e-sensor-card
entity: sensor.living_temperature
name: リビングの室温
layout: full        # full（グラフと最高・最低・平均）| compact（値と小さな折れ線、2行ぶん）
hours: 24           # 最初に表示する期間（時間）
periods: [6, 24, 168]   # 切り替えボタンの期間（時間）。省略時は 6時間・24時間・7日
# show_period_selector: false   # 切り替えボタンを出さない
```

`full` では、グラフの上のボタンで期間を切り替えられます。48時間以上で24の倍数の期間は「7日」のように日数で表示し、グラフの目盛りも日付になります。ボタンは矢印キーでも選べます。選んだ期間はその画面を開いているあいだだけ有効で、設定には書き戻しません（読み込み直すと `hours` に戻ります）。`hours` が `periods` にないときは、ボタンに加えます。

`compact` では、`levels` で値に応じたチップを出せます。CO₂ センサー（`device_class: carbon_dioxide`）は、指定がなくても「良好（1000 ppm 未満）・やや高い・換気を」を出します。

```yaml
type: custom:m3e-sensor-card
entity: sensor.living_co2
layout: compact
levels:
  - { max: 1000, label: 良好, color: green }
  - { max: 1500, label: やや高い, color: yellow }
  - { label: 換気を, color: red }
```

履歴は 48時間までは HA の `history/history_during_period` から、48時間を超える期間は長期統計（`recorder/statistics_during_period`、統計がない場合は履歴へ自動フォールバック）から取り、10分ごとに更新します。`full` ではグラフに触れる（またはマウスを乗せる）と、その時刻の値が見出しに出ます。

### `custom:m3e-water-heater-card` 給湯

```yaml
type: custom:m3e-water-heater-card
entity: water_heater.kyutoki
burning_entity: binary_sensor.kyutoki_burning     # オンの間「燃焼中」
temperatures:                                     # ▲▼ で変えられる温度
  - { entity: water_heater.kyutoki, name: 給湯 }
  - { entity: number.bath_temperature, name: ふろ }  # number / input_number も可
fill:                                             # お湯はり（0〜100% の間だけ表示）
  entity: sensor.bath_fill
  remaining_entity: sensor.bath_fill_remaining
modes:                                            # switch はオン/オフ、button は押す
  - { entity: switch.bath_auto, icon: hot-tub }
  - { entity: switch.bath_reheat }
  - { entity: switch.bath_keep_warm }
usage: [{ entity: sensor.gas_today }, { entity: sensor.water_today }]
```

日本の給湯器の連携（ECHONET Lite など）では、給湯温度・ふろ温度・お湯はり・ふろ自動が別々のエンティティになるため、それぞれを割り当てて使います。温度は続けて押してもまとめて1回だけ送ります。

### `custom:m3e-camera-card` カメラ

```yaml
type: custom:m3e-camera-card
entity: camera.entrance
events:                               # 映像の下のチップ（直近60分は色付き）
  - { entity: binary_sensor.entrance_person, name: 人を検知, icon: person }
  - { entity: event.entrance_package, name: 荷物, icon: local-shipping }
talk_entity: switch.entrance_talk     # 指定するとマイクのボタンを表示
snapshot_filename: /config/www/snapshots/entrance.jpg   # 省略するとブラウザに保存
```

```yaml
type: custom:m3e-camera-card          # 小さいサムネイル（2列に並べる）
entity: camera.garden
layout: compact
time_entity: binary_sensor.garden_motion   # 「1分前」の基準
```

HA の `ha-camera-stream` が使えるときはライブ映像を、使えないときは静止画を10秒ごと（compact は30秒ごと）に読み直して切り替えます。履歴ボタンはカメラとイベントのログブックを開きます。

### エネルギー

3枚とも、HA の「エネルギー」設定（`energy/get_prefs`）と長期統計（`recorder/statistics_during_period`）から自動でデータを取ります。エネルギーダッシュボードを設定していれば、統計 ID を書かなくても動きます。設定と違う統計を使いたいときは `sources` で上書きできます。

```yaml
type: custom:m3e-energy-card          # 現在の消費電力と、時間ごとの消費と供給
power_entity: sensor.home_power       # W でも kW でも可
solar_power_entity: sensor.solar_power
battery_entity: sensor.battery_level  # 残量 %
grid_power_entity: sensor.grid_power  # 買電がプラス、売電がマイナス
devices:                              # グラフで分ける機器（省略すると今日の使用量の多い3台）
  - { stat: sensor.ac_energy, name: エアコン }
  - { stat: sensor.water_heater_energy, name: 給湯器 }
```

```yaml
type: custom:m3e-energy-flow-card     # エネルギーの流れと自給率
battery_entity: sensor.battery_level
period: day                           # day | week | month
```

```yaml
type: custom:m3e-energy-sankey-card   # 供給元 → エリア → デバイス
max_devices: 4                        # エリアごとに出す機器の数（残りは「ほか」）
areas:                                # 省略すると、機器の HA エリアでまとめる
  - { name: リビング, color: lavender, devices: [sensor.ac_energy, sensor.tv_energy] }
```

時間ごとのグラフは消費を機器ごとに上へ、太陽光と蓄電池の放電を下へ積みます。棒をタップすると、その時間の値が右上に出ます。エネルギーの流れでは太陽光から先に蓄電池へ充電し、残りを売電したものとして家への流れを分けます（自給率 =（太陽光＋蓄電池から家へ）÷ 家の使用量）。サンキー図では家の使用量からすべての機器の合計を引いた分を「その他 → 未計測」として表示します。

### `custom:m3e-presence-card` 家族

```yaml
type: custom:m3e-presence-card
people:
  - { entity: person.yuki, color: blue }
  - { entity: person.misaki, color: pink }
  - { entity: person.sora, color: peach, eta_entity: sensor.sora_travel_time }  # 帰宅までの分数
footnote: 全員が外出すると、自動で警備をオンにします
```

在宅なら「18:42 に帰宅」（今日ずっと家にいれば「今日は外出なし」）と「在宅」のチップを出します。外出中はゾーン名を出し、`eta_entity`（Waze や Google の移動時間センサーなど）に値があれば「駅前の塾 → 自宅」と「帰宅中・約15分」を出します。アバターはイニシャルで、`show_picture: true` で person の写真に変えられます。

### `custom:m3e-vacuum-card` ロボット掃除機

```yaml
type: custom:m3e-vacuum-card
entity: vacuum.robot
battery_entity: sensor.robot_battery
current_room_entity: sensor.robot_current_room    # 以下4つは掃除中のパネル用（あるものだけ）
progress_entity: sensor.robot_progress
remaining_entity: sensor.robot_remaining
cleaned_area_entity: sensor.robot_cleaned_area
last_clean_entity: sensor.robot_last_clean_begin  # 「前回：昨日 10:12・32分」
last_clean_duration_entity: sensor.robot_last_clean_duration
filter_entity: sensor.robot_filter_left           # 「フィルター寿命 82%」（時間のセンサーなら「残り 120時間」）
rooms:
  - { name: リビング, segment: 16, area: 10, selected: true }
  - { name: キッチン, segment: 17, area: 8 }
# room_service: script.clean_rooms   # 既定は vacuum.send_command（app_segment_clean）
```

吸引力（`fan_speed_list`）を持つ掃除機では、「吸引力」のチップ（静か・標準・ターボ・最大など）で切り替えられます。`show_fan_speed: false` で消せます。場所を音で知らせる機能（`locate`）に対応していれば、見出しの右にボタンを出します。

部屋のチップを選んで「掃除を始める」を押すと、選んだ部屋だけを掃除します。既定では Roborock・Xiaomi 向けに `vacuum.send_command` で `app_segment_clean` を送ります。ほかの機種では `room_service` にスクリプトを指定すると、`segments` と `rooms`（部屋名）を変数として渡します。部屋を選ばなければ `vacuum.start` です。ポーリング間隔が長い機種でも操作直後に状態を仮表示し、HA からの応答やエラーで確定・復帰します。

### `custom:m3e-laundry-card` 洗濯機・洗濯乾燥機

```yaml
type: custom:m3e-laundry-card
entity: sensor.washer_job_state          # 運転状態（wash / rinse / spin / drying / finished など）
power_entity: switch.washer_power
course_entity: sensor.washer_course
completion_entity: sensor.washer_completion_time   # 終了時刻。分のセンサーなら remaining_entity
stats:
  - { entity: sensor.washer_power, name: 消費電力 }
  - { entity: sensor.washer_detergent, name: 洗剤の自動投入, format: 'あと {v}回分' }
notify_entity: input_boolean.laundry_notify
notify_label: 終わったらスピーカーで知らせる
steps:                                   # 省略時は 洗い / すすぎ / 脱水 / 乾燥
  - { state: [wash, washing], name: 洗い }
  - { state: rinse, name: すすぎ }
  - { state: spin, name: 脱水 }
  - { state: drying, name: 乾燥 }
```

メーカーによって運転状態の値が違うので、`steps` で状態の値と工程名を対応させます。終わった状態（既定は finished / end / complete / done）では「〇〇:〇〇 に終了」を出します。

### `custom:m3e-garbage-card` ゴミ出し

```yaml
type: custom:m3e-garbage-card
deadline: '08:30'            # この時刻を過ぎると、今日の収集は終わったものとして次へ
schedule:
  - { type: 燃やすゴミ, days: [tue, sat] }
  - { type: プラスチック資源, days: [mon] }
  - { type: びん・缶・ペットボトル, days: [thu], weeks: [1, 3] }   # 第1・第3木曜
  - { type: 粗大ゴミ, dates: ['2026-11-25'] }
# calendar: calendar.gomi    # カレンダーの予定（タイトルが種類）を収集日として使うことも可
# done_entity: input_boolean.garbage_done   # 省略すると HA のユーザーデータに記録（端末間同期・元に戻す通知つき）
note: 前日 20:00 にスマホへ通知します
```

点の色は種類の名前から決めます（燃やす → 赤、燃えない → ラベンダー、プラ → 黄、びん・缶・ペット → 水色、紙・資源 → ティール、粗大 → モーブ）。`colors` か各ルールの `color` で変えられます。

### `custom:m3e-agenda-card` 予定と買い物リスト

```yaml
type: custom:m3e-agenda-card
calendars:
  - { entity: calendar.sora, person: そ, color: peach }
  - { entity: calendar.misaki, person: み, color: pink }
  - { entity: calendar.yuki, person: ゆ, color: blue }
days: 2                      # 1 = 今日だけ、2 = 今日と明日（既定）
todo: todo.shopping_list
show_completed: 3            # チェック済みを何件まで残すか
```

予定は HA のカレンダー API から取り、終わった予定は隠します。To-do リストは項目をタップするとチェックが付いて下へ移り、「項目を追加」から追加できます（`todo.update_item`・`todo.add_item`）。

### `custom:m3e-value-card` 値（ユーティリティ）

Bool や数値を、ひとつだけシンプルに表示するカードです。

```yaml
type: custom:m3e-value-card
entity: binary_sensor.back_door   # 「閉」「開」
```

```yaml
type: custom:m3e-value-card
entity: sensor.front_door_lock_battery
name: 玄関の錠の電池
min: 0              # min か max を書くと、値の下にバーを出す（tile のみ）
max: 100
```

```yaml
type: custom:m3e-value-card
entity: input_boolean.laundry_notify
layout: row                    # tile（既定、2行ぶん）| row（1行、並べて一覧に）| mini（1行、1/3 幅）
tap_action: { action: toggle } # 既定は詳細ダイアログ
```

| オプション | 内容 |
|---|---|
| `kind` | `auto`（既定）・`boolean`・`number`。`auto` では、`binary_sensor` `input_boolean` `switch` と、値が on / off・true / false のものを Bool に、数値を数値として扱います。どちらでもなければ文字列をそのまま出します |
| `attribute` | 状態の代わりに属性を表示します（例：`current_temperature`） |
| `on_text` / `off_text` | Bool の表示。省略すると `device_class` に合わせます（door・window は「開 / 閉」、motion は「検知 / なし」、problem は「異常 / 正常」など）。当てはまらなければ「オン / オフ」 |
| `decimals` | 小数点以下の桁数。省略すると、エンティティの表示精度、なければ届いた値のまま（最大3桁）。3桁ごとにカンマを入れます |
| `unit` | 単位。省略すると `unit_of_measurement` |
| `min` / `max` | バーの範囲。片方だけ書くと、もう片方は 0 / 100 |
| `levels` | 値に応じたチップと色。書き方はセンサーカードと同じで、CO₂ センサーには既定の段階があります |

`mini` は高さ 56px・セクションの 1/3 幅で、上に小さくアイコンと名前、下に値を出します。見出しの下に値をまとめて並べるときに使います。チップは出さず、`levels` の段階はアイコンの色で表します。`min` / `max` を書くと、値の下に細いバーを出します。

Bool が真のとき、tile と mini はカード全体をアクセント色にし、row は右の値の背景をアクセント色にします。アクセント色は `device_class` から決めます（ドア・窓は peach、人感は yellow、異常・漏水・煙は red など）。`color` で変えられます。値が変わると、数字や文言が転がって切り替わります。

### `custom:m3e-fan-card` 扇風機・空気清浄機・加湿器

```yaml
type: custom:m3e-fan-card
entity: fan.living_purifier          # fan か humidifier
sensors: [sensor.living_pm25]        # 一緒に出す値（PM2.5・湿度など）
# show_speed / show_modes / show_oscillate: false で各操作部を消せる
# labels: { smart: おまかせ }        # モードの表示名
```

扇風機・サーキュレーター・空気清浄機（`fan`）は、電源のスイッチ、風量のスライダー（`percentage_step` の刻み）、プリセット（自動・おやすみ・ターボなど）、首振りと回転の向きを出します。プリセットが4つまではボタン、それより多いとチップで並べます。加湿器・除湿機（`humidifier`）は、目標湿度の −/＋（5% 刻み）、モード、今の湿度を出します。運転中はシェイプが回ります。

### `custom:m3e-control-card` 選択・数値

```yaml
type: custom:m3e-control-card
entity: input_select.house_mode      # select / input_select / number / input_number
control: auto                        # auto | buttons | chips | slider
layout: card                         # card（既定）| row（1行）
labels: { away: 外出 }               # 選択肢の表示名
```

`select` と `input_select` は選択肢をボタン（4つまで）かチップで、`number` と `input_number` はスライダーか −/＋ で操作します。`auto` では、数値はエンティティの `mode`（box なら −/＋、それ以外はスライダー）に合わせます。`layout: row` は高さ 56px の1行で、数値は −/＋、選択肢はボタンから詳細ダイアログを開きます。

### `custom:m3e-area-card` 部屋

```yaml
type: custom:m3e-area-card
area: living_room                    # HA のエリア ID
navigation_path: /lovelace/living    # タップで開くページ（tap_action も可）
# temperature_entity / humidity_entity: 見出しの温度・湿度（省略するとエリアの最初のセンサー）
# exclude_entities: [light.living_ambient]
```

HA のエリアに入っているエンティティをまとめて表示します。エリアはエンティティ自身のエリアを使い、なければデバイスのエリアを使います。非表示と設定・診断のエンティティは除きます。見出しの右に温度と湿度、下にチップで「2つ点灯」「人がいます」「1か所が開」「暖房 22.5°」「カーテン 1か所が開」「再生中の曲」を出します。照明のチップをタップすると、エリアの照明をまとめて消せます。すべて消えていればつけます。`show_light_toggle: false` にすると、詳細ダイアログを開くだけになります。

### `custom:m3e-maintenance-card` メンテナンス

```yaml
type: custom:m3e-maintenance-card
battery_threshold: 20                # この残量（%）以下の電池を出す
group_by_device: true                # 利用できない機器をデバイス単位で1行にまとめる（既定）
critical_hours: 24                   # この時間以上オフラインなら赤く強調
mute_default_hours: 24               # ベルボタンの既定ミュート時間
exclude: ['sensor.*_rssi', 'sensor.old_*']   # * が使える
max_items: 5                         # 項目ごとの件数（超えた分は「ほか N件」）
# show_batteries / show_updates / show_unavailable: false で項目を消せる
```

電池残量の少ない機器（`device_class: battery` のセンサーと、電池切れの binary_sensor）、アップデートのある `update` エンティティ、利用できなくなった機器を一覧にします。電池の行は残量に応じた背景バーで表示し、利用できない機器は既定で HA デバイス単位に集約（補助ヘルパー除外・HA 再起動をまたぐ経過時間の履歴復元）します。ベルボタンで一時ミュート（長押し・右クリック・Shift+Enter で期間選択、スナックバーから元に戻すことも可、ユーザーデータに同期）できます。何もなければ「すべて正常です」と出します。各行をタップすると詳細ダイアログを開き、アップデートの行は「更新」ボタンでインストールできます（管理者のみ）。利用できないエンティティは HA 全体を調べるため、1分ごとに読み直します。

### `custom:m3e-remote-card` テレビのリモコン

```yaml
type: custom:m3e-remote-card
entity: media_player.living_tv       # 電源・音量・再生・入力に使う（省略可）
remote_entity: remote.living_tv      # 方向キーなどを remote.send_command で送る
preset: android_tv                   # generic | android_tv | apple_tv | roku | samsung | lg
commands: { menu: SETTINGS }         # キーごとにコマンド名を上書き
key_actions:                         # キーごとに好きな操作を割り当てる
  home: { action: perform-action, perform_action: script.tv_home }
```

方向キーと決定、戻る・ホーム・メニュー、音量（ミュート）とチャンネル、巻き戻し・再生・早送り、入力の切り替えを並べます。電源・音量・ミュート・再生・入力は、`entity` のメディアプレーヤーが対応していればそちらを使い、それ以外は `remote_entity` にコマンドを送ります。コマンド名は統合によって違うので、`preset` で選ぶか `commands` で書きます。カードにフォーカスがあるときは、キーボードの矢印キーと Enter・Backspace でも操作できます。

### `custom:m3e-timer-card` タイマー

```yaml
type: custom:m3e-timer-card
entity: timer.kitchen
presets: ['3:00', '5:00', '10:00', '1:00:00']   # すぐ始める時間（分:秒、時:分:秒、または分の数値）
show_add: true                                 # 計測中に「+1分」
```

タイマーのヘルパーの残り時間を大きな数字で出し、波形のバーが残りに合わせて短くなります。スタート・一時停止・再開・取り消し、プリセットのチップ（押すとその時間で始める）、計測中の「+1分」（`timer.change`）があります。計測中だけ1秒ごとに表示を更新します。

### `custom:m3e-weather-card` 天気

```yaml
type: custom:m3e-weather-card
entity: weather.home
hours: 12         # 1時間ごとの予報の数（show_hourly: false で消す）
days: 5           # 日ごとの予報の日数、今日を含む（show_daily: false で消す）
```

今の気温と天気、体感温度・今日の最高/最低・湿度・風を出し、その下に1時間ごとの予報（横にスクロール、降水確率つき）と、日ごとの予報を並べます。日ごとの予報の帯はその週の最低から最高までの幅の中で、その日の気温の範囲を示します。

### アイコン

`icon` にはデザインに含まれる Material Symbols の名前（`lightbulb`、`m3:lightbulb` など。一覧は `src/icons/icon-data.ts`）か、HA の `mdi:` アイコンを指定できます。新しいカードと機能で使うアイコンのうちデザインにないものは、同じ Material Symbols Rounded から `src/icons/extra-icons.ts` に取り込んでいます。増やすときは `scripts/extra-icons.mjs` の一覧に名前を足して `npm run icons:extra` を実行します。

## モーション

M3 Expressive は動きを「時間＋イージング」ではなく「スプリング（剛性と減衰比）」で定義しています。`src/motion/spring.ts` にそのトークンをそのまま持たせています。

| トークン | 剛性 / 減衰比 | 用途 |
|---|---|---|
| spatial fast / default / slow | 800/0.6、380/0.8、200/0.8 | 位置・サイズ・形・回転（少し行き過ぎて戻る） |
| effects fast / default / slow | 3800/1、1600/1、800/1 | 色・不透明度（行き過ぎない） |

スプリングは2通りの方法で使います。

- CSS トランジション：スプリングを解いて `linear()` イージングに変換し、`--m3e-spatial-fast` などの CSS 変数にします（例：`transition: transform var(--m3e-spatial-fast)`）。
- JS のスプリング（`SpringValue`）：途中で目標が変わっても速度を引き継ぎます。スライダーやシェイプのモーフィングで使います。

カードごとの動きは次のとおりです。

- シェイプのモーフィング：オフでは円、オンでは9角クッキーになり、変わるときに1周期ぶん回転します。形はデザインの Star（頂点数・内径比・角丸）と同じ作り方で生成し、極座標でサンプリングして補間しています（`src/shapes/shapes.ts`）。
- 押したときの変形：ボタングループは押したボタンが横に広がって角が丸くなり、隣のボタンが縮みます。−/＋ボタンやシーンのボタンも押すと角が丸くなります。
- スイッチ：つまみがバネで移動し、押している間は 28px に大きくなります。
- スライダー：タップした位置へバネで動き、ドラッグ中はつまみが 4px から 2px に細くなります。
- 数字：設定温度、明るさ、時計の数字は、増えれば上へ、減れば下へ転がって切り替わります。
- 波形プログレス：再生中は波が流れ、一時停止で平らになります。シークできるときは、再生位置に細いつまみを常に表示します。押すとつまみが伸び、波が平らになって位置を読みやすくなります。離すと波が戻ります。再生ボタンは、再生中が角丸の四角、停止中がピル型です。
- 折りたたみ：エアコンの風量・風向パネル、消灯したライトの操作部、給湯のお湯はりパネルはバネで開閉します。
- カーテン：窓のイラストのカーテン（シェード）が、開き具合に合わせてバネで動きます。
- グラフ：センサーの折れ線は左から描かれ、新しいデータでは形が変わります。エネルギーの棒グラフは時間順に少しずつずれて、ゼロの線から伸びます。サンキー図は、日・週・月を切り替えると、すべての帯がバネで新しい大きさと位置へ移ります。
- 流れ：エネルギーの流れでは、点が線に沿って動きます。量が多い流れほど速く、売電は破線が外へ流れます。

OS で「視差効果を減らす」を有効にしている場合は、アニメーションをすべて止めます。

## 構成

```
src/
  motion/      スプリング（トークン、linear() 変換、SpringValue）
  shapes/      M3E シェイプの生成とモーフィング
  theme/       Latte / Mocha と14色のアクセント
  editor/      HA の編集画面（カードのフォーム＋アクセントカラーの色見本）
  icons/       デザインから抽出したアイコン（scripts/extract-icons.mjs で生成）
  components/  m3e-shape, m3e-switch, m3e-slider, m3e-button-group, m3e-wavy-progress, m3e-rolling-text, m3e-icon, m3e-line-chart, m3e-keypad, m3e-fetch-status
  ha/          HA との接続（履歴・エネルギー統計・天気予報・取得状態・集計・表示用の文言、ゴミ出しの規則・時間の書式）
  cards/       各カード（共通処理は base-card.ts、複数の操作部を持つカードの共通スタイルは shared-styles.ts）
preview/       モックの HA を使ったプレビュー（editor.html は編集画面の確認用）
tests/         テスト（vitest。cards/ と components/ は happy-dom でのカード操作テスト、helpers/ はその補助）
themes/        HA テーマ
```
