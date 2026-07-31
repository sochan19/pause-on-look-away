// アプリ全体で共有する設定値をまとめるファイル。
// PoCページ(src/main.ts)だけでなく、Phase 2以降でcontent script側の
// ヒステリシス判定でも同じしきい値を使う予定のため、最初から src/shared/ に置いておく
// (architecture.md 6章のディレクトリ構成案に合わせている)。

// 「カメラの方を向いている」とみなすYawのしきい値(度)。
// 値が大きいほど「多少よそ見しても視聴中とみなす」緩い判定になる。
// Phase 1では固定値。設定画面からユーザーが変更できるようにするのはPhase 7(F-21)で対応する。
export const FACING_THRESHOLD_DEG = 20;

// 候補状態(1フレームごとのlooking/away判定)が何フレーム連続したら
// 確定状態を切り替えるか(ヒステリシス、F-03)。
// 値が大きいほど「まばたきや一瞬の首振りでは反応しない」安定した判定になるが、
// 切り替わりの反応も遅くなる。
// Phase 2では固定値。実機での体感調整(Surfaceでの手動確認)はPhase 2以降で行う。
export const CONFIRMATION_FRAME_COUNT = 15;

// offscreen documentでの顔向き検出ループを何ミリ秒間隔で回すか。
// PoCページ(main.ts)はrequestAnimationFrame(画面のリフレッシュレート、
// 通常60fps=約16ms間隔)で回していたが、offscreen documentは不可視のため
// requestAnimationFrameがスロットルされる(検証済み)。そのため代わりに
// setIntervalを使う。顔の向きは60fpsの精度で追う必要はなく、MediaPipeでの
// 推論自体もCPU/GPU負荷が軽くないため、間隔を広げてCPU使用率を抑える(N-01)。
// CONFIRMATION_FRAME_COUNT(15)と組み合わせると、状態確定までの遅延は
// 約1.5秒(100ms × 15回)になる想定。
export const DETECTION_INTERVAL_MS = 100;

// 「視聴」状態に復帰した際に、自動で動画の再生を再開するかどうかのデフォルト値(F-11)。
// 本来は設定画面(Phase7、F-21)からユーザーが切り替えられるようにする項目だが、
// 設定画面ができるまではこの固定値がそのまま使われる。
// true = 自動再開する。Phase7で設定機能を実装する際は、このtrueをデフォルト値として使う想定
// (docs/DECISIONS.md E章で「自動再開ON固定」として決定済み)。
export const AUTO_RESUME_ENABLED = true;

// background/content scriptのconsole.logの先頭に付ける共通の目印。
// 開発者ツールのコンソールで大量のログに混ざっても、この拡張機能が出したログだと
// フィルタ(検索)しやすくするための文字列。background/content両方から参照するので
// ここに置く(1箇所で書き換えられるように、直接文字列リテラルを書き散らさない)。
export const LOG_PREFIX = "[Gaze-Aware Playback]";
