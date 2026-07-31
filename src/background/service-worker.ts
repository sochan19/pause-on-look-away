// このファイルの役割:
// background service worker のエントリポイント。Phase 4からは、
// 「視聴/非視聴の確定状態が変化したら、アクティブタブのcontent scriptへ
// pause/resumeメッセージを送る」という中継ロジック(handleConfirmedStateChange)を
// 実装する。
//
// service worker はMV3の仕様上アイドル状態が続くと自動的に停止・破棄される
// (裏で常駐し続けるわけではない)。そのため、モジュールスコープの変数に状態を
// 持たせても次に起動した時には消えている前提で設計する必要がある。
// Phase4で使う devSimulatedState はあくまで開発用の仮状態であり、再起動されると
// 必ず"looking"にリセットされる。これにより例えば「本当はaway(非視聴)だったのに
// 再起動でlookingに戻ってしまう」ようなズレが起こりうるが、video.pause()/play()は
// 呼んでも実害のない冪等な操作なので、次にアイコンをクリックすれば正しい状態に
// 追従する(=多少ズレても実害は一時的で自己修復する)ため、今は割り切っている。
// Phase5で本物のカメラ判定状態を持つようになったら chrome.storage への永続化を検討する。

import { onActionClicked } from "../shared/chrome/action";
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
 * Phase5でカメラ判定(ヒステリシス状態機械)の確定状態が変わるたびにこの関数が
 * 呼ばれるようになる想定の中継ロジック本体。Phase4時点では呼び出し元がまだ
 * 存在しないため、下記のonActionClicked(開発用トリガー)から仮に呼び出して
 * 動作確認する。
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

// 【Phase4限定の開発用トリガー】
// カメラ処理(Phase5)がまだ無いため、拡張機能アイコンのクリックを
// 「視聴⇔非視聴が切り替わった」ことの仮のイベントとして使う。詳細は
// src/shared/chrome/action.tsのコメントを参照(要手動確認・docs/manual-test.md)。
let devSimulatedState: ConfirmedState = "looking";

// onClickedのコールバックはクリックされたタブ(chrome.tabs.Tab)を引数で受け取れるが、
// あえて使わずhandleConfirmedStateChange内部でgetActiveTabId()を呼び直している。
// Phase5ではカメラの状態変化イベントにはそもそも「クリックされたタブ」という概念が
// 無く、常に「今アクティブなタブ」に対して送る設計になる。今のうちからその形に
// 合わせておくことで、Phase5でこの関数をそのまま再利用できるようにしている。
onActionClicked(() => {
  devSimulatedState = devSimulatedState === "looking" ? "away" : "looking";
  console.log(
    `${LOG_PREFIX} [dev] アイコンクリックで状態を仮に切り替え -> ${devSimulatedState}`,
  );
  void handleConfirmedStateChange(devSimulatedState);
});
