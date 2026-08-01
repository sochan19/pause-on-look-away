// アプリ全体で共有する設定値をまとめるファイル。
// PoCページ(src/main.ts)だけでなく、Phase 2以降でcontent script側の
// ヒステリシス判定でも同じしきい値を使う予定のため、最初から src/shared/ に置いておく
// (architecture.md 6章のディレクトリ構成案に合わせている)。
//
// 注意: 判定角度・ディレイフレーム数・自動再開ON/OFFは、Phase 6まではここに固定値として
// 置いていたが、Phase 7(F-20, F-21)でユーザーが設定画面から変更できるようになったため
// src/shared/settings.ts の DEFAULT_SETTINGS に移動した。ここに残すのは
// 「ユーザーが変更する余地のない、本当に固定の値」だけにする。

// offscreen documentでの顔向き検出ループを何ミリ秒間隔で回すか。
// PoCページ(main.ts)はrequestAnimationFrame(画面のリフレッシュレート、
// 通常60fps=約16ms間隔)で回していたが、offscreen documentは不可視のため
// requestAnimationFrameがスロットルされる(検証済み)。そのため代わりに
// setIntervalを使う。顔の向きは60fpsの精度で追う必要はなく、MediaPipeでの
// 推論自体もCPU/GPU負荷が軽くないため、間隔を広げてCPU使用率を抑える(N-01)。
// confirmationFrameCount(設定のデフォルト値は15、settings.ts参照)と組み合わせると、
// 状態確定までの遅延は約1.5秒(100ms × 15回)になる想定。
export const DETECTION_INTERVAL_MS = 100;

// background/content scriptのconsole.logの先頭に付ける共通の目印。
// 開発者ツールのコンソールで大量のログに混ざっても、この拡張機能が出したログだと
// フィルタ(検索)しやすくするための文字列。background/content両方から参照するので
// ここに置く(1箇所で書き換えられるように、直接文字列リテラルを書き散らさない)。
export const LOG_PREFIX = "[GazePause]";
