# GazePause — Claude Code 指示書

視線(顔向き)検出で YouTube / Prime Video を自動一時停止する Chrome 拡張(Manifest V3)。
詳細は必ず `docs/requirements.md` と `docs/architecture.md` を参照すること。

## 最重要方針: 初心者向けであること

**開発者は TypeScript も Chrome 拡張機能も今回が初めて。** すべての実装において以下を徹底する。

- **コメントを多く書く**。「何をしているか」だけでなく「なぜそう書くか」も書く。特に以下は必須:
  - ファイル冒頭に、そのファイルの役割を2〜3行で説明するコメント
  - 型定義(`type` / `interface`)には、その型が何を表すかのコメント
  - MV3特有の書き方(offscreen、sendMessage等)や、少し癖のあるロジック(ヒステリシス状態機械など)には、なぜそう実装するかの理由コメント
  - 例: `// service worker はアイドル状態で自動停止するため、状態は chrome.storage に保存する(メモリ上の変数だけに頼らない)`
- **ディレクトリ構成はできるだけフラットにする**。architecture.md の案をベースにしつつ、深いネスト(3階層以上)は避け、迷ったら浅い方を選ぶ
- **一度に大きな実装をしない**。小さいステップに分けて、都度動作確認できる単位で進める
- 専門用語を使う場合、コメントや説明で簡単に補足する

## 技術スタック(決定事項)

- 言語: TypeScript(strict)
- ビルド: Vite + @crxjs/vite-plugin(MV3 はリモートコード禁止のため MediaPipe の wasm / .task モデルは必ずローカル同梱。CDN 読み込みは禁止)
- テスト: Vitest(単体)/ Playwright(E2E、後続フェーズ)
- Lint / Format: Biome
- パッケージ管理: npm / Node 20 以上

## よく使うコマンド

- `npm run dev` — 開発ビルド(watch)
- `npm run build` — 本番ビルド(dist/ に拡張機能一式)
- `npm run typecheck` — tsc --noEmit
- `npm run lint` — Biome チェック
- `npm run test` — Vitest 単体テスト(CI モードは `npm run test -- --run`)

## アーキテクチャ上の絶対ルール

1. **判定ロジックは純粋関数にする。** Yaw 角度計算・ヒステリシス(Nフレーム継続判定)の状態機械は `src/shared/` に chrome API / DOM / MediaPipe 非依存の純粋関数として実装する。これが単体テストの対象。
2. **chrome.* API は薄いラッパー経由で呼ぶ**(`src/shared/chrome/`)。テスト時にモック差し替え可能にするため。
3. **カメラ映像・顔データを外部送信するコードを書かない**(要件 N-02)。fetch / XHR / WebSocket で外部サーバーへ送るコードは一切禁止。
4. **manifest.json の権限は最小限**(要件 N-03)。権限を追加する変更は必ず理由をコミットメッセージに書き、ユーザーに確認を取る。
5. content script では `document.querySelector('video')` を直接使わず、「再生中の video を特定する」ユーティリティを使う(YouTube はサムネイルの自動再生 video が複数存在しうる)。

## 開発ワークフロー(実装→テスト→commit)

新機能・修正は必ずこの順で行う:

1. 実装(関連する要件 ID を意識する)
2. 単体テストを書く/更新する(純粋ロジックは必須)
3. `npm run typecheck && npm run lint && npm run test -- --run` を全て通す
4. code-reviewer サブエージェント(+ Anthropic公式 security-guidance プラグイン)でレビュー
5. commit(下記規約)→ push

一連の流れは `/ship` スキルで実行できる。`main` ブランチのみで作業するため、commit はそのまま `main` に積み重なる。

**テスト・typecheck・lint のいずれかが失敗している状態で commit してはならない。**(`.githooks/pre-commit` でも強制される)

## Git 規約

- Conventional Commits: `feat:` `fix:` `test:` `refactor:` `docs:` `chore:`(この英語プレフィックスのみ規約に従う)
- **件名は日本語で書く**(例: `feat: 顔向き判定のヒステリシスロジックを実装`)。本文(任意)も日本語。要件 ID があれば本文に記載(例: `対応: F-03`)
- 粒度: 1 コミット = 1 つの論理的変更。フェーズ丸ごと 1 コミットにしない
- **ブランチは作らず、常に `main` で作業する**(初めてのプロジェクトのため、ブランチ運用は導入しない)
- **commit 後、`git push` まで自動で行ってよい**(ユーザー確認不要)。ただし force push は禁止

## 手動確認が必要な項目

カメラ実機・DRM(Prime Video)・拡張機能の実ブラウザ挙動は自動テスト不可。該当変更時は `docs/manual-test.md` のチェックリストを更新し、commit 本文に「要手動確認: <項目>」と記載する。

## 未決事項に触れる場合

`docs/architecture.md` 9章の未決事項(offscreen での getUserMedia 許可フロー、Prime Video の DRM、SPA 遷移対応)に関わる実装は、勝手に方式を確定せず、検証コード + 選択肢の提示から始めること。
