# 初回セットアップ手順

このファイル一式をプロジェクトのルート(`requirements.md` / `architecture.md` があるフォルダ)に配置した後、最初に1回だけ行うこと。

## 1. Git hooks を有効化

```bash
git config core.hooksPath .githooks
```

これで `git commit` のたびに typecheck / lint / test が自動実行されるようになる。

## 2. Claude Code で security-guidance プラグインを導入

Claude Code のセッション内で以下を実行(D-4で決定):

```
/plugin marketplace add anthropics/claude-code
/plugin install security-guidance@anthropics
```

これにより、code-reviewer サブエージェント(プロジェクト固有ルール担当)に加えて、一般的なセキュリティ観点(機密情報の扱い等)も自動チェックされるようになる。

## 3. プロジェクト初期化を Claude Code に依頼

以下のような指示で開始する:

```
CLAUDE.md と docs/DECISIONS.md の内容に沿って、
Vite + TypeScript + Chrome拡張(MV3)のプロジェクトを初期化してください。
architecture.md の6章のディレクトリ構成案をベースに、
できるだけフラットな構成にしてください。
```

plan mode(Shift+Tab)で最初に計画を確認してから進めるとよい。

## 確認事項

- [ ] `git config core.hooksPath .githooks` を実行した
- [ ] security-guidance プラグインを導入した
- [ ] Node.js 20以上がインストールされている(`node -v` で確認)
