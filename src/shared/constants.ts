// アプリ全体で共有する設定値をまとめるファイル。
// PoCページ(src/main.ts)だけでなく、Phase 2以降でcontent script側の
// ヒステリシス判定でも同じしきい値を使う予定のため、最初から src/shared/ に置いておく
// (architecture.md 6章のディレクトリ構成案に合わせている)。

// 「カメラの方を向いている」とみなすYawのしきい値(度)。
// 値が大きいほど「多少よそ見しても視聴中とみなす」緩い判定になる。
// Phase 1では固定値。設定画面からユーザーが変更できるようにするのはPhase 7(F-21)で対応する。
export const FACING_THRESHOLD_DEG = 20;
