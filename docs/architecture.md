# システム設計書 — GazePause

対応: `requirements.md`

## 1. システム構成概要

Chrome拡張機能(Manifest V3)として実装する。以下4つのコンポーネントで構成する。

```
┌─────────────────────────────────────────────────────────┐
│                     Chrome Extension                      │
│                                                             │
│  ┌───────────────┐      ┌──────────────────────────┐      │
│  │ offscreen      │      │ background service worker │      │
│  │ document       │◄────►│ (状態管理 / メッセージ中継) │      │
│  │ (MediaPipe実行) │      └────────────┬─────────────┘      │
│  └───────┬────────┘                   │                    │
│          │ getUserMedia                │ chrome.tabs.sendMessage
│          ▼                             ▼                    │
│     [Webカメラ]              ┌──────────────────────┐       │
│                               │ content script         │       │
│                               │ (YouTube / Prime Video) │      │
│                               │  video要素の pause/play │      │
│                               └──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## 2. コンポーネント設計

### 2.1 offscreen document(顔向き検出)

- **役割**: Webカメラ映像の取得、MediaPipe Face Landmarkerによる顔向き判定
- **理由**: Manifest V3のservice workerはDOM/カメラAPIに直接アクセスできないため、`chrome.offscreen` APIで隠しページを作り、そこでカメラ処理を行う
- **入力**: `getUserMedia()`によるカメラストリーム
- **出力**: `{ state: "looking" | "away", timestamp }` を background へ送信
- **判定ロジック**:
  - 顔ランドマークからYaw(左右の首振り角度)を算出
  - 閾値角度を超えた状態が連続Nフレーム継続したら `away` に確定(誤検知防止)
  - 閾値・Nフレームは設定値として外部化

### 2.2 background service worker

- **役割**: 状態の一元管理、タブ間のメッセージ中継
- **保持する状態**:
  - 現在のカメラ判定状態(`looking` / `away`)
  - 現在アクティブな動画タブのID
  - ユーザー設定(感度、自動再開有無)
- **処理**:
  1. offscreen documentから状態変化を受信
  2. アクティブタブがYouTube / Prime Videoか判定
  3. 該当タブのcontent scriptへ `pause` / `resume` メッセージを送信

### 2.3 content script

- **役割**: 対象ページのDOMに注入され、video要素を直接操作
- **対象**: `youtube.com`, `amazon.co.jp`(Prime Video), `primevideo.com`
- **処理**:
  - `document.querySelector('video')` でvideo要素を取得
  - backgroundからのメッセージに応じて `.pause()` / `.play()` を実行
  - SPA(シングルページアプリ)による画面遷移でvideo要素が再生成されるケースに対応するため、`MutationObserver`での再取得を検討

### 2.4 popup / options UI

- **役割**: ユーザー向け設定画面
- **項目**:
  - カメラON/OFF切り替え
  - 判定感度(角度しきい値、ディレイフレーム数)
  - 復帰時の自動再開ON/OFF
  - 現在の検出状態のライブ表示(デバッグ用)

## 3. データフロー

| # | 発生元 | 内容 | 送信先 | 手段 |
|---|---|---|---|---|
| 1 | Webカメラ | 映像ストリーム | offscreen document | `getUserMedia()` |
| 2 | offscreen document | 顔向き判定結果 | background | `chrome.runtime.sendMessage()` |
| 3 | background | 一時停止/再開指令 | content script | `chrome.tabs.sendMessage()` |
| 4 | content script | 実行結果(成功/失敗) | background | `sendResponse()` |
| 5 | popup | 設定変更 | background(→ offscreen) | `chrome.storage.sync` 経由 |

## 4. manifest.json 設計方針

必要権限は最小限とする。

| 権限 | 用途 |
|---|---|
| `permissions: ["offscreen", "storage", "tabs"]` | offscreen document生成、設定保存、タブ操作 |
| `host_permissions` | `*://*.youtube.com/*`, `*://*.primevideo.com/*`, `*://*.amazon.co.jp/*` |
| `content_scripts` | 上記対象ドメインに自動注入 |

カメラ権限(`camera`)自体はmanifestではなく、offscreen document内で`getUserMedia()`実行時にユーザー許可を得る形になる想定(要検証)。

## 5. 技術スタック

| 領域 | 技術 |
|---|---|
| 拡張機能基盤 | Chrome Extension Manifest V3 |
| 顔検出 | MediaPipe Face Landmarker (JavaScript / Tasks Vision API) |
| 言語 | JavaScript もしくは TypeScript(型安全性を優先するならTS推奨) |
| 状態保存 | `chrome.storage.sync` / `chrome.storage.local` |
| ビルド | 初期はビルドレスで開始し、規模拡大時にVite等を検討 |

> **Claude Code設定での補足(docs/DECISIONS.md参照)**: 実際にはMV3のリモートコード禁止によりMediaPipeの資材をローカル同梱する必要があるため、初期段階からVite + @crxjs/vite-pluginを採用する方針に変更済み。言語はTypeScript(strict)に確定。

## 6. ディレクトリ構成案

```
gaze-pause/
├── manifest.json
├── src/
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.js        # MediaPipe実行・判定ロジック
│   ├── background/
│   │   └── service-worker.js   # 状態管理・メッセージ中継
│   ├── content/
│   │   ├── youtube.js
│   │   └── primevideo.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── shared/
│       └── constants.js        # 閾値・メッセージ種別などの共通定義
├── icons/
└── docs/
    ├── requirements.md
    └── architecture.md
```

> **Claude Code設定での補足**: 開発者が初学者のため、実装時はこの案をベースにしつつ、できるだけフラットな構成(3階層を超えるネスト回避)を優先する(docs/DECISIONS.md P-2参照)。

## 7. 判定ロジック詳細(初期案)

```
IF 顔が検出されない OR Yaw角度 > しきい値:
    候補状態 = "away"
ELSE:
    候補状態 = "looking"

IF 候補状態が確定状態と異なる:
    継続カウント += 1
    IF 継続カウント >= しきい値フレーム数:
        確定状態 = 候補状態
        状態変化をbackgroundへ通知
ELSE:
    継続カウント = 0
```

- しきい値角度・フレーム数は初期値を仮設定し、実機での体感調整を前提とする
- 「顔検出できない」ケース(遮蔽・退席)は `away` 扱いとする(要件 F-04 に対応)

## 8. フェーズ別実装計画

| フェーズ | 内容 | 対応要件ID |
|---|---|---|
| Phase 1 | 単体HTMLでのMediaPipe顔向き検出PoC | F-01, F-02 |
| Phase 2 | 判定ディレイ・しきい値ロジックの実装 | F-03, F-04 |
| Phase 3 | manifest.json / background / content script の骨組み作成 | N-03 |
| Phase 4 | YouTubeでのpause/play制御実装 | F-10〜F-12 |
| Phase 5 | offscreen documentへのカメラ処理統合 | N-01, N-02 |
| Phase 6 | Prime VideoでのDRM環境下動作検証 | F-13 |
| Phase 7 | popup/options UIと通知の実装 | F-20〜F-22 |

## 9. 未決事項(要検証)

- offscreen document内での`getUserMedia()`許可フローの挙動(初回許可の出方)
- Prime Video側のDOM構造・video要素へのアクセス可否(DRM影響)
- SPA遷移時のcontent script再注入・video要素再取得のタイミング

> **Claude Code設定での補足**: この章の項目はdocs/DECISIONS.md の「E. 設計上の未決事項」に引き継がれ、該当Phaseの実装時にClaude Codeが調査・PoCを行った上で選択肢を提示する運用とする。
