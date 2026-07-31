// このファイルの役割:
// background service worker のエントリポイント。大きく2つの役割を持つ。
//
// 1. 「視聴/非視聴の確定状態が変化したら、アクティブタブのcontent scriptへ
//    pause/resumeメッセージを送る」中継ロジック(handleConfirmedStateChange、Phase4〜)
// 2. 「activeタブがカメラ判定の対象サイト(YouTube/Prime Video)かどうかに応じて、
//    offscreen documentへカメラの起動/停止を指示する」タブ連動ロジック(Phase5〜)。
//    offscreen document自体はブラウザが起動している間ずっと存在させ続け
//    (MediaPipeモデルの再読み込みコストを避けるため)、カメラストリームの
//    ON/OFFだけをタブに連動させる(DECISIONS.md E-2)。
//
// service worker はMV3の仕様上アイドル状態が続くと自動的に停止・破棄される
// (裏で常駐し続けるわけではない)。そのため、モジュールスコープの変数に状態を
// 持たせても次に起動した時には消えている前提で設計する必要がある。
// video.pause()/play()、およびoffscreenへのSTART_CAMERA/STOP_CAMERAはどちらも
// 呼んでも実害のない冪等な操作なので、多少状態がズレても次のイベントで自己修復する
// (=一時的なズレは許容する)という考え方を踏襲する。

import {
  ensureOffscreenDocument,
  hasOffscreenDocument,
} from "../shared/chrome/offscreen";
import {
  onInstalled,
  onMessage,
  onStartup,
  sendMessage,
} from "../shared/chrome/runtime";
import {
  getActiveTabId,
  getActiveTabUrl,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
  sendMessageToTab,
} from "../shared/chrome/tabs";
import { AUTO_RESUME_ENABLED, LOG_PREFIX } from "../shared/constants";
import {
  isCameraErrorMessage,
  isConfirmedStateChangedMessage,
  isSetPlaybackResponse,
  type OffscreenControlMessage,
  type SetPlaybackMessage,
  type SetPlaybackResponse,
} from "../shared/messages";
import { decidePlaybackCommand } from "../shared/playback-policy";
import { isCameraTargetUrl } from "../shared/site-detection";
import type { ConfirmedState } from "../shared/viewing-state";

console.log(`${LOG_PREFIX} service worker starting up`);

onInstalled((details) => {
  console.log(`${LOG_PREFIX} onInstalled: reason=${details.reason}`);
  recomputeCameraActivation();
});

/**
 * 視聴状態(ConfirmedState)の変化を受け取り、必要ならアクティブタブへ
 * pause/resumeメッセージを送る。
 *
 * offscreen document(カメラ判定・ヒステリシス状態機械)の確定状態が変わるたびに
 * CONFIRMED_STATE_CHANGEDメッセージ経由で呼ばれる中継ロジック本体。
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

// 直近に計算した「activeタブは対象サイトか」の結果。同じ結果が続く間は
// offscreenへ重複してSTART/STOP_CAMERAを送らないようにするためのキャッシュ。
// service worker再起動でリセットされても、次にタブイベントが起きた時点で
// 再計算されるだけなので実害はない(このファイル冒頭のコメント参照)。
let lastKnownIsTargetActive: boolean | undefined;

// recomputeCameraActivation()の呼び出しを直列化する(1つずつ順番に処理する)ための
// Promiseチェーン。chrome.tabs.onUpdatedはタブの読み込み中に何度も発火しうるため、
// 短時間に何度も呼ばれることがある。もし並行して実行すると、「activeタブのURLを読む」
// →「lastKnownIsTargetActiveと比較」の間に別の呼び出しが割り込み、両方とも同じ
// 古い比較対象を見て重複してSTART_CAMERA/STOP_CAMERAを送ってしまう
// (TOCTOU: time-of-check to time-of-use、という典型的な競合状態)。
// 常にこのチェーンへ .then() でつなげることで、前の呼び出しの処理が完全に終わって
// からでないと次が始まらないようにする。
let recomputeQueue: Promise<void> = Promise.resolve();

/**
 * 「今activeなタブはカメラ判定の対象サイトか」を再計算し、必要ならoffscreen
 * documentへSTART_CAMERA/STOP_CAMERAを送る。
 *
 * タブの切り替え・URL変化・削除のたびに呼ばれる想定(content scriptがSPA遷移の
 * たびにDOMを再クエリするのと同じ「都度re-queryする」設計。E-5決定事項を参照)。
 * ブラウザ起動時・拡張機能インストール時にも呼ぶことで、起動した時点で既に
 * 対象タブが開かれているケースにも対応する。
 *
 * この関数自体は同期関数(Promiseを返さない)にしてあり、呼び出し側は結果を
 * 待たずに呼びっぱなしにできる。実際の処理はrecomputeQueueに追加されるだけで、
 * 直列化のために実行タイミングがずれることがあるため。
 */
function recomputeCameraActivation(): void {
  recomputeQueue = recomputeQueue
    .then(() => doRecomputeCameraActivation())
    .catch((error) => {
      console.error(`${LOG_PREFIX} recomputeCameraActivationに失敗:`, error);
    });
}

async function doRecomputeCameraActivation(): Promise<void> {
  const url = await getActiveTabUrl();
  const isTargetActive = isCameraTargetUrl(url);

  if (isTargetActive === lastKnownIsTargetActive) {
    return;
  }
  lastKnownIsTargetActive = isTargetActive;

  if (isTargetActive) {
    await ensureOffscreenDocument();
    await sendMessage<OffscreenControlMessage>({ type: "START_CAMERA" });
    console.log(`${LOG_PREFIX} 対象サイトがアクティブ -> START_CAMERA`);
  } else if (await hasOffscreenDocument()) {
    // offscreen documentがまだ一度も作られていない(=一度もカメラを使っていない)
    // 場合は、わざわざ作ってから止めるようなことはせず何もしない。
    await sendMessage<OffscreenControlMessage>({ type: "STOP_CAMERA" });
    console.log(`${LOG_PREFIX} 対象サイトから離脱 -> STOP_CAMERA`);
  }
}

onTabActivated(() => {
  recomputeCameraActivation();
});
onTabUpdated(() => {
  recomputeCameraActivation();
});
onTabRemoved(() => {
  recomputeCameraActivation();
});
onStartup(() => {
  recomputeCameraActivation();
});

// offscreen documentからのメッセージ(CONFIRMED_STATE_CHANGED / CAMERA_ERROR)を
// 受け取るリスナー。chrome.runtime.onMessageは拡張機能内の他のメッセージも
// 受信してしまうため、型ガードで自分が処理すべき形かどうかを確認してから処理する。
onMessage((message, _sender, _sendResponse) => {
  if (isConfirmedStateChangedMessage(message)) {
    void handleConfirmedStateChange(message.state);
    return false;
  }
  if (isCameraErrorMessage(message)) {
    console.warn(`${LOG_PREFIX} offscreenでカメラエラー: ${message.reason}`);
    return false;
  }
  return false;
});
