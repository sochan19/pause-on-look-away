# 決定事項チェックリスト

「Claude Code に実装→テスト→commit を任せる」ために確定させた項目。
✅ = 確定済み。CLAUDE.md / .claude/settings.json に反映済み。

## A. 技術選定(自動テストの成立に直結)

| # | 決めること | 確定内容 | 理由・備考 |
|---|---|---|---|
| A-1 | 言語 | ✅ **TypeScript (strict)** | 型でミスを機械検出できる方が初学者・自動化と相性が良い |
| A-2 | ビルド | ✅ **Vite + @crxjs/vite-plugin** | MV3はリモートコード禁止のためMediaPipeのwasm/.taskモデルをローカル同梱する必要があり、実質バンドラ必須 |
| A-3 | 単体テスト | ✅ **Vitest** | Viteと同一設定で動く。判定ロジック(純粋関数)が主対象 |
| A-4 | chrome APIモック | ✅ 自作ラッパー + vitestのvi.mock | 外部ライブラリより薄いラッパーの方が学習コストが低い |
| A-5 | E2E | ✅ **Playwright(後続フェーズ)** | Chromeのフェイクカメラ機能で顔向き判定のE2Eも自動化可能。Phase 4以降で導入判断 |
| A-6 | Lint / Format | ✅ **Biome** | ESLint+Prettierより設定が1ファイルで済む |
| A-7 | Node / パッケージ管理 | ✅ **Node 20+ / npm** | 標準構成 |
| A-8 | MediaPipeモデルの同梱方法 | 保留 | リポジトリ直接同梱 か postinstallでダウンロードか。Phase 5で検討 |

## B. Git 運用

| # | 決めること | 確定内容 |
|---|---|---|
| B-1 | コミット規約 | ✅ Conventional Commits。**プレフィックス(feat:/fix:等)は英語、件名・本文は日本語**。要件IDを本文に記載 |
| B-2 | コミット粒度 | ✅ 1コミット = 1論理的変更(フェーズ丸ごと禁止) |
| B-3 | ブランチ戦略 | ✅ **ブランチを作らず常に `main` で作業**(初めてのプロジェクトのため運用をシンプルに) |
| B-4 | pushの扱い | ✅ **commit後、確認なしで自動push**。force pushのみ禁止 |
| B-5 | dist/等の扱い | 保留 | .gitignore対象。A-8と連動して決める |
| B-6 | バージョニング | 保留 | manifest.jsonのversionをsemverで管理。タグ付けは手動(当面不要) |

## C. 「commit してよい」の定義(Definition of Done)

| # | 決めること | 確定内容 |
|---|---|---|
| C-1 | 必須ゲート | ✅ typecheck + lint + 単体テスト + build 成功(.githooks/pre-commitで強制) |
| C-2 | テストカバレッジ基準 | ✅ 数値目標なし。「src/shared/の純粋ロジックはテスト必須」という質的ルール |
| C-3 | 自動テスト不能な項目の扱い | ✅ `docs/manual-test.md`のチェックリスト方式。commit本文に「要手動確認」を明記 |
| C-4 | レビュー | ✅ commit前に code-reviewer サブエージェント + security-guidanceプラグイン(D-4)必須 |

## D. Claude Code の運用方法

| # | 決めること | 確定内容 |
|---|---|---|
| D-1 | 進め方 | ✅ 各Phaseの冒頭はplan mode(Shift+Tab)で計画を承認 → 実装はacceptEditsで進行 |
| D-2 | 自動許可の範囲 | ✅ settings.json設定済み: テスト/ビルド/commit/push は自動、npm install・ブランチ操作は確認、force push・rm -rfは拒否 |
| D-3 | CI | 保留 | GitHub Actionsは個人開発の当面は不要(ローカルのpre-commitで代替)。必要になれば追加 |
| D-4 | セキュリティレビュー | ✅ **Anthropic公式 security-guidance プラグインを導入**。code-reviewerサブエージェント(プロジェクト固有ルール担当)と役割分担 |

## プロジェクト全体の方針(追加確定事項)

| # | 決めること | 確定内容 |
|---|---|---|
| P-1 | コメント量 | ✅ **多めに書く**。ファイル冒頭に役割説明、複雑なロジックには「なぜ」を書く理由コメント必須(初めてのTS/Chrome拡張のため) |
| P-2 | ディレクトリ構成 | ✅ **できるだけフラットに**。3階層を超えるネストは避ける |
| P-3 | 実装単位 | ✅ 一度に大きな実装をせず、小さいステップで都度動作確認する |

## E. 設計上の未決事項(architecture.md 9章 + レビューでの追加)

**これは「今チャットで決めるもの」ではなく、実装時にClaude Codeが調査・PoCを行い、選択肢を提示してから確定する項目です。** 該当Phaseに来るまでは何もしなくて問題ありません。

1. **カメラ許可フロー**: offscreen documentは不可視のためgetUserMediaの許可ダイアログを自力で出せない可能性が高い。「初回のみoptionsページ(可視ページ)で許可を取得→以後offscreenで利用」を第一候補としてPhase 5で検証
2. **offscreen documentのライフサイクル**: service workerはアイドルで終了する。offscreen(reason: USER_MEDIA)を常駐させる設計と、視聴していない時にカメラを止める省電力設計の両立方法
3. **Prime VideoのDRM**: video.pause()自体はDRMの影響を受けない見込みだが、プレイヤーUIとの整合(再開時の挙動)は実機検証(Phase 6)
4. **対象videoの特定**: ✅ **「可視 かつ 最大面積」で選定**(Phase4で決定)。`src/shared/video-selection.ts`の`selectPrimaryVideoIndex()`で実装。「再生中かどうか」を条件にしないのは、この拡張機能自身がpause()を呼んだ直後は対象videoが一時停止中になり、resume時に同じ基準で再選択できなくなる問題を避けるため
5. **YouTube SPA遷移**: ✅ **専用の監視の仕組み(MutationObserver/`yt-navigate-finish`)は導入しない**(Phase4で決定)。content scriptがbackgroundからのメッセージを受け取るたびに`findPrimaryVideo()`でDOMを再クエリする設計にすることで、キャッシュを持たないためSPA遷移が自然に無害化される。将来「video要素の有無を能動的に監視する」要件が出てきたら再検討する
6. **自動再開のデフォルト値**: ✅ **ON(`AUTO_RESUME_ENABLED = true`)で固定**(Phase4で決定、`src/shared/constants.ts`)。Phase 7で設定画面ができるまではこの固定値を使う。設定画面実装時にこの初期値でよいか改めてユーザーへ確認する
