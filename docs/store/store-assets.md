# Chromeウェブストア掲載用画像 — GazePause

出典: https://developer.chrome.com/docs/webstore/images (2026年8月時点の要件)。
提出直前にDeveloper Dashboard上の最新の画像要件(サイズ・枚数・形式)を必ず再確認すること
(ポリシー更新: https://developer.chrome.com/blog/cws-policy-updates-2026 も参照)。

## 1. アイコン(作成済み・変更不要)

`public/icons/icon128.png` ほか16/32/48/128pxを既存デザイン(白背景に、目のモチーフの中心に
青い丸と白い一時停止アイコン)で作成済み。ストア掲載でも同じ128pxアイコンをそのまま使用する。
新規作成は不要。

## 2. スクリーンショット(最低1枚・最大5枚、必須)

- サイズ: 1280×800px(推奨)または640×400px
- フォーマット: PNG または JPEG
- 余白(パディング)なしのフルブリード、角は直角(丸めない)
- 実際の拡張機能UIを操作して撮影する必要があるため、下記は撮影計画(構図案)。
  ブラウザ操作が可能な環境(実機 or Playwright等)で撮影後、このリストに沿って採用可否を判断する

| # | 内容 | 撮影対象・構図 | 優先度 |
|---|---|---|---|
| 1 | optionsページの設定画面全体 | `chrome-extension://<id>/src/options/options.html` を開いた状態。有効/無効チェックボックス、判定感度(角度しきい値・確定フレーム数)の入力欄、自動再開ON/OFF、カメラ許可ボタンがすべて画面内に収まる構図。可能ならカメラ許可状態が「許可済み」になっている状態で撮る(初回インストール時の混乱を避けるため) | 必須(1枚目) |
| 2 | YouTube視聴中に自動で一時停止した瞬間 | YouTubeの動画再生画面で、一時停止アイコンが表示された状態のスクリーンショット。可能であれば動画タイトルや再生バーが見える構図にし、「動画が止まっている」ことが一目でわかるようにする。著作権的に問題のない動画(自分がアップロードした動画、または公式のフリー素材・プレースホルダー動画)を使う | 必須(2枚目) |
| 3 | popup(カメラ許可状態の表示) | 拡張機能アイコンをクリックして開いたpopup。「カメラ: 許可済み」等のステータス表示と、optionsページへの誘導ボタンが見える構図 | 推奨(3枚目) |
| 4 | Prime Video視聴中の同様のシーン | Prime Videoの動画再生画面で一時停止された状態(YouTube版と同じ構図)。DRM環境のため、実機(Surface等)での撮影が必要 | 任意(4枚目、可能なら含める) |
| 5 | (予備)判定感度を調整した後の設定画面、または一時停止からの自動再開の瞬間 | 上記4枚で構成の幅が狭い場合の補完用 | 任意(5枚目) |

撮影時の注意:
- 実際の顔・カメラ映像そのものは映さない(プライバシーポリシーで「映像は外部送信・保存しない」と
  訴求している手前、UIキャプチャに顔映像を写り込ませるのは避ける。カメラのミニプレビュー等がUIに
  ある場合はモザイクを掛けるか、映らない構図にする)
- ブラウザのURLバーやブックマークバーなど拡張機能と無関係な情報が写り込まないよう、可能であれば
  キオスクモードやウィンドウサイズ調整でトリミングする
- 日本語UIであることが伝わる構図にする(ターゲットユーザーが日本語話者のため)

## 3. プロモーション用小タイル(必須)

- サイズ: 440×280px
- フォーマット: PNG または JPEG(透過不可、背景まで描画する)
- デザイン方針: 既存アイコン(`public/icons/icon128.png`)の「目 + 一時停止マーク」モチーフを
  そのまま踏襲し、ブランドの一貫性を保つ。アイコンと同系統の配色(白背景、黒〜濃紺のアウトライン、
  青い丸に白い一時停止アイコン)を維持する
- 構成案: 中央〜左寄りにアイコンモチーフを大きく配置し、右側または下部に拡張機能名
  「GazePause」の文字を添える(文字は必須ではないが、タイル単体で見た際に何の拡張機能か
  伝わりやすくなる)

### 画像生成プロンプト案(小タイル用)

```
A minimal flat-design app icon illustration for a browser extension called "GazePause",
440x280px promotional tile, white background, centered eye icon with a blue circular
pause symbol (two vertical bars) inside the pupil, thin dark navy outline, simple
geometric style, no gradients, no photographic elements, clean vector look, small
"GazePause" wordmark in dark navy sans-serif to the right of the icon, generous
whitespace, full-bleed edge to edge, no rounded corners in the canvas
```

## 4. マーケティング用マーケティー画像(任意)

- サイズ: 1400×560px
- フォーマット: PNG または JPEG
- 構成案: 小タイルと同じモチーフ(目+一時停止マーク)を左側に配置し、右側の広い余白に
  日本語のキャッチコピー(例:「よそ見をしたら、動画は自動で止まる。」)を配置する横長レイアウト

### 画像生成プロンプト案(マーケティング画像用)

```
A wide 1400x560px marketing banner for a Chrome extension called "GazePause", flat
minimal design, white background, on the left a large eye icon with a blue circular
pause symbol (two vertical bars) inside the pupil and a thin dark navy outline (same
style as the app icon), on the right side plenty of whitespace reserved for Japanese
headline text, clean vector illustration style, no gradients, no photographic
elements, no clutter, full-bleed edge to edge
```

補足: 生成後、右側の余白に日本語キャッチコピーを別途(画像編集ソフトや軽量なHTML/Canvas
スクリプトで)重ねる想定。生成モデルに日本語文字を直接描画させると文字化けしやすいため、
テキストは画像生成後に別工程で追加する。

## 5. 提出前チェックリスト

- [ ] スクリーンショットを実際に撮影し、1〜5の構図案から採用する枚数・順序を確定する
- [ ] 小タイル(440×280px)・マーケティング画像(1400×560px、任意)を生成・仕上げる
- [ ] Developer Dashboard上で、上記サイズ・枚数・ファイル形式の要件が変わっていないか再確認する
- [ ] スクリーンショットに顔・カメラ映像が写り込んでいないか最終確認する
