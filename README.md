# M3E Cards

FigCraft のホームダッシュボードのデザイン（`../home-dashboard.figcraft`）を、Home Assistant のカスタムカードとして実装したライブラリです。配色は Catppuccin の Latte（ライト）と Mocha（ダーク）で、動きは Material 3 Expressive のモーションに合わせています。

## 使い方

```sh
npm install
npm run dev     # プレビュー（モックの HA）を http://localhost:5173/preview/ で開く
npm run build   # dist/m3e-cards.js を作る
```

### Home Assistant への組み込み

1. `npm run build` で作った `dist/m3e-cards.js` を `<config>/www/` にコピーします。
2. 「設定 → ダッシュボード → リソース」で `/local/m3e-cards.js` を **JavaScript モジュール**として追加します。
3. ダッシュボードの周りの色も合わせる場合は、`themes/m3e-catppuccin.yaml` をテーマとして読み込みます。

カードは HA のダークモードに合わせて Latte と Mocha を自動で切り替えます。どちらかに固定したいときは `theme: latte` か `theme: mocha` を指定します。

#### カード追加時の候補（HA 2026.6 以降）

「カードを追加」でデバイスやエンティティを選ぶと、そのエンティティに合う M3E カードが「コミュニティ」の欄に候補として表示されます。レイアウトが複数あるカードは、レイアウトごとに候補が出ます。

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

### スマートフォン・タブレットでのコンパクト表示

スマートフォンやタブレットで開くと、カードは自動でコンパクト表示になります。余白と文字を小さくし、大きな数字やボタンも一回り小さくするので、1枚のカードが画面を占めなくなります。おもな変化は次のとおりです。

- 時計と天気（hero）は、時計と今の天気を横に並べます。高さはおよそ半分になります。
- タイルは1行（高さ 56px）になり、スイッチを省きます。タイル自体をタップすると切り替わります。スイッチも出したいときは `show_switch: true` を指定します。
- エアコンは、室温と湿度のチップを状態の行（「暖房中・室温 21.8°・湿度 45%」）にまとめます。

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

### アクセントカラー（`color`）

`color` には Catppuccin の14色のアクセントを指定できます。

`rosewater` `flamingo` `pink` `mauve` `red` `maroon` `peach` `yellow` `green` `teal` `sky` `sapphire` `blue` `lavender`

省略すると、カードごとの既定の色を使います。カードの編集画面（ビジュアルエディタ）では、カード固有の項目の下に色見本が並びます。色見本は今のテーマ（Latte / Mocha）の色で表示し、選んだ色が両方のテーマでどう見えるかを下の見本で確認できます。「自動」を選ぶと `color` を消します。

エアコンと照明のカードは、運転モードや照明の色に合わせて色が変わるため、編集画面に色見本を出しません（照明カードの `color` は、照明の色が取れないときの予備の色として、これまでどおりフォームの選択肢で指定できます）。

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

右側には、いくつかのエンティティを数えた結果も出せます。`{entity, name}` と書くと値の前に名前が付きます（「浴室 24.5°」）。

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

`text` では `{n}`（当てはまる数）のほかに `{rest}`（当てはまらない数）と `{total}`（全体の数）も使えます（例：`在宅 {n}人・外出 {rest}人`）。`summary: { type: date }` と書くと、今日の日付（「11月13日（金）」）を出します。

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

`color`・`temperature`・`full` レイアウトではカード全体を着色しません。エアコンカードと同じく背景は中立のままにし、アイコンのシェイプ、状態テキスト、スイッチ、明るさスライダーを照明の今の色に合わせます。色は Latte では濃いめ、Mocha ではパステルに調整するので、どの色でも文字やアイコンが読めます。色相・彩度スライダーや色温度スライダーをドラッグしている間も色が追従します。色温度の色は、色温度スライダーと同じグラデーションから取ります。電球色はオレンジ、昼白色は中立のグレー、昼光色は青みになります。`color` オプションは、照明の色が取れないときの予備の色として使います。

`full` レイアウトは、フルカラーと色温度の両方に対応した照明向けです。明るさスライダーを上に置き、その下の「カラー / 色温度」のボタンで操作部を切り替えます。切り替えるとパネルが横にスライドし、高さはスプリングで変わります。最初に開くタブは照明の今の `color_mode` に合わせ、ほかの画面で照明の色の種類が変わると、それに合わせてタブも切り替わります。タブを切り替えるだけでは照明に命令を送りません。プリセットやスライダーを操作したときに切り替わります。色の同期は `color` レイアウトと同じです。

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

運転モードによってカード全体の色が変わります（暖房 peach、冷房 blue、除湿 teal、送風 green、自動 lavender）。左右の風向は `swing_horizontal_modes`（HA 2024.12 以降）があるときだけ表示します。

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

切り替えのエンティティを指定した行は、見出しの右に「自動」スイッチが付きます。自動のあいだはボタンの選択を外し、要約にも「自動」と出します。自動のままボタンを押すと、先に手動へ切り替えてから値を設定します。設定エンティティを指定せず切り替えだけを指定した場合は、エアコン本体の風量・風向のボタンにスイッチが付きます。ボタンがない行でも、切り替えを指定していればスイッチだけの行として表示します。カードの UI エディタでは、風量・風向（上下）・風向（左右）の折りたたみ項目からそれぞれ選べます。

#### ボタンとスライダー

選択肢が多くてボタンが1行に収まらない行は、スライダーで設定します。行ごとに `fan_control`・`swing_control`・`swing_horizontal_control` で切り替えられます。

```yaml
fan_control: auto     # auto（既定）| buttons | slider
swing_control: slider
```

- `auto`：カードの幅とボタンの文字数から、ボタンが収まるかを見積もります。収まらないときだけスライダーにします。カードの幅が変わると選び直します。
- `buttons`：常にボタンにします。ただし、`number` で12段階を超える行はボタンにできないのでスライダーにします。
- `slider`：常にスライダーにします。

スライダーの段階は、選択肢を並び順のまま左から割り当てます（「静音・1・2…・パワフル」なら左端が静音）。`auto`・`swing`・`off`・`wide`・`スイング`・`固定` のように段階ではない選択肢は、スライダーの左にボタンとして残します。3つ以上あるときは、ボタンをスライダーの上の行に並べます。`number`・`input_number` の行は、エンティティの `min`・`max`・`step` をそのまま使い、値に単位を付けて表示します。

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

プレーヤーがジャケット画像（`entity_picture`）を返すときは、ジャケットをカード全体の背景にうっすら表示します（左上の小さなジャケットは出しません）。下へいくほど背景色に溶け込み、操作ボタンが見やすくなります。一時停止中はさらに薄くなります。`show_backdrop: false` を指定すると、背景には出さず、従来どおり左上に小さく表示します。濃さとぼかしは CSS 変数 `--m3e-media-backdrop-opacity`（既定 `0.55`）と `--m3e-media-backdrop-blur`（既定 `0px`）で調整できます。

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

`compact` は高さ 56px（セクションの1行分）の1行で、アイコン・名前・「エリア・開閉と位置」と ▲ ■ ▼ のボタンを並べます。エリアの代わりに好きな文言を出すときは `secondary` を指定します。

```yaml
type: custom:m3e-cover-card
entity: cover.study_blind
layout: compact
secondary: 書斎      # 省略すると HA のエリア名
```

以前の `entities`（下に並べる行）は廃止しました。複数のカーテンは、[カテゴリでまとめる](#カテゴリでまとめる)のように1つずつカードにします。

### `custom:m3e-alarm-card` 警備

```yaml
type: custom:m3e-alarm-card
entity: alarm_control_panel.home
```

警備状態をカード全体の色とシェイプで表示します。警備中は緑、開始中・まもなく警報は黄、警報中は赤、警備オフは無彩色です。下の行には名前と、その状態になった時刻（わかれば操作した人も）を出します。タップすると HA の詳細ダイアログが開き、そこで警備の開始・解除ができます。

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

錠に暗証番号が必要なとき（`code_format` があるとき）は、操作するとカードの中にテンキーが開きます。番号が違うと HA のエラーを表示し、入力欄が揺れます。「ドアを開ける」（ラッチ解除）は、誤操作を防ぐため2回タップで実行します。最後に操作した人（`changed_by`）がわかる錠では、それもチップに出します。

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
hours: 24
```

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

履歴は HA の `history/history_during_period` から取り、10分ごとに更新します。`full` ではグラフに触れる（またはマウスを乗せる）と、その時刻の値が見出しに出ます。

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

### エネルギー（3枚）

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

時間ごとのグラフは、消費を機器ごとに上へ、太陽光と蓄電池の放電を下へ積みます。棒をタップすると、その時間の値が右上に出ます。エネルギーの流れでは、太陽光から先に蓄電池へ充電し、残りを売電したものとして家への流れを分けます（自給率 =（太陽光＋蓄電池から家へ）÷ 家の使用量）。サンキー図では、家の使用量からすべての機器の合計を引いた分を「その他 → 未計測」として表示します。

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

部屋のチップを選んで「掃除を始める」を押すと、選んだ部屋だけを掃除します。既定では Roborock・Xiaomi 向けに `vacuum.send_command` で `app_segment_clean` を送ります。ほかの機種では `room_service` にスクリプトを指定すると、`segments` と `rooms`（部屋名）を変数として渡します。部屋を選ばなければ `vacuum.start` です。

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
# done_entity: input_boolean.garbage_done   # 省略すると「出した」はこの端末に記録
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

### アイコン

`icon` には、デザインに含まれる Material Symbols の名前（`lightbulb`、`m3:lightbulb` など。一覧は `src/icons/icon-data.ts`）か、HA の `mdi:` アイコンを指定できます。

## モーション

M3 Expressive は動きを「時間＋イージング」ではなく「スプリング（剛性と減衰比）」で定義しています。`src/motion/spring.ts` にそのトークンをそのまま持たせています。

| トークン | 剛性 / 減衰比 | 用途 |
|---|---|---|
| spatial fast / default / slow | 800/0.6、380/0.8、200/0.8 | 位置・サイズ・形・回転（少し行き過ぎて戻る） |
| effects fast / default / slow | 3800/1、1600/1、800/1 | 色・不透明度（行き過ぎない） |

スプリングは2通りの方法で使います。

- **CSS 遷移**：スプリングを解いて `linear()` イージングに変換し、`--m3e-spatial-fast` などの変数で配ります（例：`transition: transform var(--m3e-spatial-fast)`）。
- **JS のスプリング**（`SpringValue`）：途中で目標が変わっても速度を引き継ぎます。スライダーやシェイプのモーフィングで使います。

カードごとの動きは次のとおりです。

- **シェイプのモーフィング**：オフでは円、オンでは9角クッキーになり、変わるときに1周期ぶん回転します。形はデザインの Star（頂点数・内径比・角丸）と同じ作り方で生成し、極座標でサンプリングして補間しています（`src/shapes/shapes.ts`）。
- **押したときの変形**：ボタングループは押したボタンが横に広がって角が丸くなり、隣のボタンが縮みます。−/＋ボタンやシーンのボタンも押すと角が丸くなります。
- **スイッチ**：つまみがバネで移動し、押している間は 28px に大きくなります。
- **スライダー**：タップした位置へバネで動き、ドラッグ中はつまみが 4px から 2px に細くなります。
- **数字**：設定温度、明るさ、時計の数字は、増えれば上へ、減れば下へ転がって切り替わります。
- **波形プログレス**：再生中は波が流れ、一時停止で平らになります。シークできるときは、再生位置に細いつまみを常に表示します。押すとつまみが伸び、波が平らになって位置を読みやすくなります。離すと波が戻ります。再生ボタンは、再生中が角丸の四角、停止中がピル型です。
- **折りたたみ**：エアコンの風量・風向パネル、消灯したライトの操作部、給湯のお湯はりパネルはバネで開閉します。
- **カーテン**：窓のイラストのカーテン（シェード）が、開き具合に合わせてバネで動きます。
- **グラフ**：センサーの折れ線は左から描かれ、新しいデータでは形が変わります。エネルギーの棒グラフは時間順に少しずつずれて、ゼロの線から伸びます。サンキー図は、日・週・月を切り替えると、すべての帯がバネで新しい大きさと位置へ移ります。
- **流れ**：エネルギーの流れでは、点が線に沿って動きます。量が多い流れほど速く、売電は破線が外へ流れます。

OS で「視差効果を減らす」を有効にしている場合は、アニメーションをすべて止めます。

## 構成

```
src/
  motion/      スプリング（トークン、linear() 変換、SpringValue）
  shapes/      M3E シェイプの生成とモーフィング
  theme/       Latte / Mocha と14色のアクセント（10色は FigCraft の変数から、4色は同じ規則で生成）
  editor/      HA の編集画面（カードのフォーム＋アクセントカラーの色見本）
  icons/       デザインから抽出したアイコン（scripts/extract-icons.mjs で生成）
  components/  m3e-shape, m3e-switch, m3e-slider, m3e-button-group, m3e-wavy-progress, m3e-rolling-text, m3e-icon, m3e-line-chart
  ha/          HA との接続（履歴・エネルギー統計・集計・表示用の文言）
  cards/       各カード（共通処理は base-card.ts）
preview/       モックの HA を使ったプレビュー（editor.html は編集画面の確認用）
themes/        HA テーマ
```
