// このファイルの役割:
// 「視聴中/非視聴」の確定状態(ConfirmedState、viewing-state.ts参照)が変化したとき、
// content scriptへどのコマンド(pause/resume)を送るべきか、あるいは何も送らない
// べきかを決める純粋関数を提供する。
// 自動再開ON/OFF(F-11)の判断はここに集約する。まだ設定画面(Phase7)が無いため
// 固定値(AUTO_RESUME_ENABLED)を使うが、判断ロジック自体は先に実装しておくことで、
// Phase7で設定値を差し込むだけで済むようにする。
// chrome API/DOMに依存しない純粋関数なのでVitestでテストできる
// (アーキテクチャ絶対ルール1)。

import type { PlaybackCommand } from "./messages";
import type { ConfirmedState } from "./viewing-state";

/**
 * 確定状態(looking/away)・自動再開設定・「今一時停止しているのは拡張機能自身か」
 * から、送るべきコマンドを決める。
 *
 * - "away"(非視聴確定) → 常に"pause"を送る(F-10)。動画が既に(ユーザーの操作等で)
 *   一時停止していても、pause()の呼び直し自体は無害なので気にせず送る。
 * - "looking"(視聴に復帰) → autoResumeEnabledがfalseなら何もしない(nullを返す。
 *   ユーザーの手動再生を待つ、F-11)。
 *   autoResumeEnabledがtrueでも、pausedByExtensionがfalseの場合はnullを返す。
 *   これは「ユーザーが自分の意思で一時停止していた動画」まで、視線が戻っただけで
 *   勝手に再生してしまうのを防ぐため(実機検証で発見したバグへの対応)。
 *   例: 動画を手動で一時停止 → よそ見 → 視線を戻す、という操作をしても、
 *   拡張機能が一時停止させたわけではない動画なので再生を再開しない。
 * - pausedByExtensionは呼び出し側(service-worker.ts)が、直近の"pause"コマンドが
 *   実際に再生中→一時停止という状態変化を起こせたか(content scriptからの
 *   レスポンス)をもとに管理する。
 */
export function decidePlaybackCommand(
  state: ConfirmedState,
  autoResumeEnabled: boolean,
  pausedByExtension: boolean,
): PlaybackCommand | null {
  if (state === "away") {
    return "pause";
  }
  if (!autoResumeEnabled) {
    return null;
  }
  return pausedByExtension ? "resume" : null;
}

/**
 * content scriptからのレスポンス(コマンドが成功し、実際に状態が変わったか)をもとに、
 * 次にどの値をpausedByExtensionとして覚えておくべきかを決める。
 *
 * - "pause"が成功し、実行前は再生中だった(alreadyInStateがfalse) → 拡張機能が
 *   実際に一時停止させたことになるので true(次回looking復帰時にresume対象にする)
 * - "pause"が成功したが、実行前から既に一時停止していた(alreadyInStateがtrue)
 *   → 拡張機能は何も変えていない(ユーザーの手動一時停止、または既に拡張機能が
 *   止めていた等)ため false。「拡張機能が変化させたと確証が持てる場合のみtrue」
 *   という安全側の判断にすることで、万が一この状態がズレていても
 *   「勝手に再生してしまう」方向ではなく「自動再開が効かない」方向に倒れるようにする
 * - "resume"が成功した → 一時停止状態は解消されたので false
 */
export function nextPausedByExtension(
  command: PlaybackCommand,
  alreadyInState: boolean,
): boolean {
  if (command === "resume") {
    return false;
  }
  return !alreadyInState;
}
