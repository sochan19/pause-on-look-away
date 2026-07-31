// このファイルの役割:
// ユーザーが設定画面(optionsページ)から変更できる値をまとめた型とデフォルト値を定義する。
// Phase 1〜6では判定感度・自動再開は src/shared/constants.ts の固定値だったが、
// Phase 7(F-20, F-21)からは chrome.storage.sync に保存されたユーザー設定を使うようになる。
// このファイル自体は chrome.storage を直接触らない純粋なファイルにし(アーキテクチャ絶対
// ルール1・2)、実際の読み書きは src/shared/chrome/storage.ts に任せる。
// 「設定できる値の型」と「chrome.storage依存の読み書き」を分けることで、
// このファイルの中身(型・デフォルト値・境界値チェック)だけはVitestで単体テストできる。

// ユーザーが変更できる設定値の一覧。
export interface Settings {
  // 拡張機能全体を一時的に無効化するかどうか(F-20)。
  // falseの間は、activeタブがYouTube/Prime Videoであってもカメラを起動しない
  // (background/service-worker.tsのdoRecomputeCameraActivation()参照)。
  enabled: boolean;

  // 「カメラの方を向いている」とみなすYawのしきい値(度)。値が大きいほど
  // 「多少よそ見しても視聴中とみなす」緩い判定になる(F-21)。
  facingThresholdDeg: number;

  // 候補状態が何フレーム連続したら確定状態を切り替えるか(ヒステリシス、F-21)。
  // 値が大きいほど誤検知に強くなるが、切り替わりの反応も遅くなる。
  confirmationFrameCount: number;

  // 「視聴」状態に復帰した際、自動で動画の再生を再開するかどうか(F-11, F-21)。
  autoResumeEnabled: boolean;
}

// 設定がまだ一度も保存されていない場合(初回インストール直後等)に使うデフォルト値。
// Phase 6までの固定値(FACING_THRESHOLD_DEG=20, CONFIRMATION_FRAME_COUNT=15,
// AUTO_RESUME_ENABLED=true)をそのまま引き継ぐ(DECISIONS.md E-6により自動再開は
// ON初期値のまま据え置くことをユーザーに再確認済み)。
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  facingThresholdDeg: 20,
  confirmationFrameCount: 15,
  autoResumeEnabled: true,
};

// 角度しきい値の妥当な範囲(度)。0度に近すぎると少し首を動かしただけで
// 反応してしまい、90度に近いと顔がほぼ真横を向くまで反応しなくなり実用的でないため、
// options.htmlのinput要素のmin/max属性と保存時のバリデーションの両方で
// この範囲に収める。
export const FACING_THRESHOLD_MIN_DEG = 5;
export const FACING_THRESHOLD_MAX_DEG = 45;

// ディレイフレーム数の妥当な範囲。DETECTION_INTERVAL_MS(100ms間隔)と組み合わせると
// 1フレーム=約100msのため、1〜100は約0.1秒〜10秒の反応遅延に相当する。
export const CONFIRMATION_FRAME_COUNT_MIN = 1;
export const CONFIRMATION_FRAME_COUNT_MAX = 100;

/**
 * 設定画面の数値入力欄から受け取った値を、妥当な範囲に収める純粋関数。
 *
 * <input type="number">はHTML側のmin/max属性だけでは実際の値を強制できない
 * (ユーザーが手入力で範囲外の値やカラ欄、小数を入力できてしまう)ため、
 * 保存前にJavaScript側でも必ずこの関数を通す。
 * NaN/Infinity(空欄・不正な入力の結果として起こりうる)の場合はfallback
 * (通常はDEFAULT_SETTINGSの値)を返し、壊れた設定がchrome.storageに
 * 保存されてしまうことを防ぐ。
 * facingThresholdDeg(角度)もconfirmationFrameCount(フレーム数)も、
 * 意味的には整数値として扱う項目のため、範囲に収めた後にMath.round()で
 * 整数へ丸める(例えば15.5フレームのような値が保存されるのを防ぐ)。
 */
export function clampSettingNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.min(max, Math.max(min, value)));
}
