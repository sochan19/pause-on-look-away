// このファイルの役割:
// background service worker のエントリポイント。Phase 4からは、
// 「視聴/非視聴の確定状態が変化したら、アクティブタブのcontent scriptへ
// pause/resumeメッセージを送る」という中継ロジック(handleConfirmedStateChange)を
// 実装している。
//
// service worker はMV3の仕様上アイドル状態が続くと自動的に停止・破棄される
// (裏で常駐し続けるわけではない)。そのため、モジュールスコープの変数に状態を
// 持たせても次に起動した時には消えている前提で設計する必要がある。
// video.pause()/play()は呼んでも実害のない冪等な操作なので、多少状態がズレても
// 次の確定状態変化通知で自己修復する(=一時的なズレは許容する)という考え方を
// 引き続き踏襲する。

import { onInstalled } from "../shared/chrome/runtime";
import { getActiveTabId, sendMessageToTab } from "../shared/chrome/tabs";
import { AUTO_RESUME_ENABLED, LOG_PREFIX } from "../shared/constants";
import {
  isSetPlaybackResponse,
  type SetPlaybackMessage,
  type SetPlaybackResponse,
} from "../shared/messages";
import { decidePlaybackCommand } from "../shared/playback-policy";
import type { ConfirmedState } from "../shared/viewing-state";

console.log(`${LOG_PREFIX} service worker starting up`);

onInstalled((details) => {
  console.log(`${LOG_PREFIX} onInstalled: reason=${details.reason}`);
});

/**
 * 視聴状態(ConfirmedState)の変化を受け取り、必要ならアクティブタブへ
 * pause/resumeメッセージを送る。
 *
 * offscreen document(Phase5で実装予定)のカメラ判定・ヒステリシス状態機械の
 * 確定状態が変わるたびに呼ばれるようになる想定の中継ロジック本体。
 * 呼び出し元の配線は後続コミットで行う。
 */
async function handleConfirmedStateChange(
  state: ConfirmedState,
): Promise<void> {
  const command = decidePlaybackCommand(state, AUTO_RESUME_ENABLED);
  if (command === null) {
    console.log(`${LOG_PREFIX} state=${state}: 自動再開OFFのため何もしません`);
    return;
  }

  const tabId = await getActiveTabId();
  if (tabId === null) {
    console.warn(
      `${LOG_PREFIX} handleConfirmedStateChange: アクティブなタブが見つかりません`,
    );
    return;
  }

  const message: SetPlaybackMessage = { type: "SET_PLAYBACK", command };
  const response = await sendMessageToTab<
    SetPlaybackMessage,
    SetPlaybackResponse
  >(tabId, message);

  // sendMessageToTab()の型引数(TResponse)は「型としてはこう見える」という
  // 宣言に過ぎず、実際に相手(content script)がその形で返してきた保証はない。
  // response.ok等のフィールドを信じて分岐する前に、型ガードで実際の形を確認する
  // (今はログ出力するだけだが、Phase5で失敗時のリトライ等を足す前提の備え)。
  if (response !== null && !isSetPlaybackResponse(response)) {
    console.warn(
      `${LOG_PREFIX} state=${state} -> command=${command}: 想定外の形のレスポンス`,
      response,
    );
    return;
  }

  console.log(
    `${LOG_PREFIX} state=${state} -> command=${command} response=`,
    response,
  );
}
