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
 * 確定状態(looking/away)と自動再開設定から、送るべきコマンドを決める。
 *
 * - "away"(非視聴確定) → 常に"pause"を送る(F-10)
 * - "looking"(視聴に復帰) → autoResumeEnabledがtrueなら"resume"を送る。
 *   falseの場合は「視聴に戻っただけでは何もしない」(ユーザーの手動再生を待つ)ため、
 *   nullを返す(F-11)。
 */
export function decidePlaybackCommand(
  state: ConfirmedState,
  autoResumeEnabled: boolean,
): PlaybackCommand | null {
  if (state === "away") {
    return "pause";
  }
  return autoResumeEnabled ? "resume" : null;
}
