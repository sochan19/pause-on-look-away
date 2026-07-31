---
name: ship
description: 現在の変更を「検証 → レビュー → commit」まで一貫して完了させるワークフロー。実装が一段落したとき、またはユーザーが /ship・「コミットまでやって」と言ったときに使用する。
---

# ship — 検証からcommitまでの標準ワークフロー

以下を順番に実行する。**途中で失敗したら次に進まず、修正してからそのステップを再実行する。**

## 1. 品質ゲート

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

- 失敗したら原因を修正し、再実行。テストを消したり skip したりして通すことは禁止。
- 新規ロジック(特に `src/shared/` の純粋関数)にテストが無い場合は先にテストを追加する。

## 2. レビュー

- `code-reviewer` サブエージェントを起動し、未コミット変更をレビューさせる。
- Anthropic 公式 security-guidance プラグインが有効な場合はその指摘も確認する。
- critical 指摘があれば修正して手順 1 からやり直す。warning は修正するか、見送る理由をユーザーに報告する。

## 3. commit と push

- `git status` と `git diff` で変更内容を最終確認し、無関係なファイル(dist/, ログ等)が含まれていないことを確認する。
- 論理的変更が複数混ざっている場合はコミットを分割する。
- Conventional Commits 形式(プレフィックスは英語、**件名は日本語**、要件 ID を本文に記載)で commit する。
- 手動確認が必要な変更(カメラ・DRM・実ブラウザ挙動)は `docs/manual-test.md` を更新し、commit 本文に「要手動確認: <項目>」と書く。
- ブランチは切らず `main` にそのまま commit する。
- commit 後、そのまま `git push` する(確認不要。force push は禁止)。

## 4. 報告

- 実行結果(テスト件数、レビュー指摘の要約、コミットハッシュと件名、push 完了)を簡潔にユーザーへ報告する。
