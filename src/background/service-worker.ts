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
  clearPausedByExtension,
  getPausedByExtension,
  getSettings,
  onSettingsChanged,
  setPausedByExtension,
} from "../shared/chrome/storage";
import {
  getActiveTabId,
  getActiveTabUrl,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
  sendMessageToTab,
} from "../shared/chrome/tabs";
import { LOG_PREFIX } from "../shared/constants";
import {
  isCameraErrorMessage,
  isConfirmedStateChangedMessage,
  isSetPlaybackResponse,
  type OffscreenControlMessage,
  type SetPlaybackMessage,
  type SetPlaybackResponse,
  type SettingsUpdatedMessage,
} from "../shared/messages";
import {
  decidePlaybackCommand,
  nextPausedByExtension,
} from "../shared/playback-policy";
import type { Settings } from "../shared/settings";
import { isCameraTargetUrl } from "../shared/site-detection";
import type { ConfirmedState } from "../shared/viewing-state";

console.log(`${LOG_PREFIX} service worker starting up`);

onInstalled((details) => {
  console.log(`${LOG_PREFIX} onInstalled: reason=${details.reason}`);
  recomputeCameraActivation();
});

// handleConfirmedStateChange()の呼び出しを直列化する(1つずつ順番に処理する)ための
// Promiseチェーン。recomputeQueue(下記)と同じ考え方: 短時間に複数の
// CONFIRMED_STATE_CHANGEDが連続すると、「pausedByExtensionを読む」→「pause/resumeを
// 送る」→「pausedByExtensionを書く」の間に次の呼び出しが割り込み、古い呼び出しの
// 結果で新しい呼び出しの結果を上書きしてしまう競合(TOCTOU)が起こりうるため。
let handleStateChangeQueue: Promise<void> = Promise.resolve();

/**
 * 視聴状態(ConfirmedState)の変化を受け取り、必要ならアクティブタブへ
 * pause/resumeメッセージを送る。
 *
 * offscreen document(カメラ判定・ヒステリシス状態機械)の確定状態が変わるたびに
 * CONFIRMED_STATE_CHANGEDメッセージ経由で呼ばれる中継ロジック本体。
 * この関数自体は同期関数にしてあり、実際の処理はhandleStateChangeQueueに
 * 追加されるだけ(recomputeCameraActivation()と同じパターン)。
 */
function handleConfirmedStateChange(state: ConfirmedState): void {
  handleStateChangeQueue = handleStateChangeQueue
    .then(() => doHandleConfirmedStateChange(state))
    .catch((error) => {
      console.error(`${LOG_PREFIX} handleConfirmedStateChangeに失敗:`, error);
    });
}

async function doHandleConfirmedStateChange(
  state: ConfirmedState,
): Promise<void> {
  const tabId = await getActiveTabId();
  if (tabId === null) {
    console.warn(
      `${LOG_PREFIX} handleConfirmedStateChange: アクティブなタブが見つかりません`,
    );
    return;
  }

  // service workerはアイドルでいつ終了・再起動されるかわからないため、
  // offscreen.tsのようにモジュール変数へキャッシュせず、必要になるたびに
  // getSettings()/getPausedByExtension()で都度読み直す(このファイル冒頭の
  // コメント、およびdoRecomputeCameraActivation()と同じ「都度re-query」の方針)。
  // pausedByExtensionは「拡張機能が一時停止させた動画かどうか」というタブ単位の
  // 状態で、chrome.storage.session(service worker再起動をまたいで保持され、
  // ブラウザを閉じれば消える)にtabIdをキーとして保存している
  // (src/shared/chrome/storage.tsのコメント参照。実機検証で見つかった
  // 「よそ見が長引いてservice workerが再起動すると、拡張機能自身が一時停止させた
  // 動画すら自動再開されなくなる」問題への対応。モジュール変数のままだと
  // 再起動でリセットされてしまうため永続化が必要だった)。
  const [settings, pausedByExtension] = await Promise.all([
    getSettings(),
    getPausedByExtension(tabId),
  ]);
  const command = decidePlaybackCommand(
    state,
    settings.autoResumeEnabled,
    pausedByExtension,
  );
  if (command === null) {
    console.log(
      `${LOG_PREFIX} state=${state}: 何もしません(自動再開OFF、または拡張機能が` +
        "一時停止させた動画ではないため)",
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

  // pausedByExtensionを更新する。実際に成功した(response.ok === true)場合のみ
  // 更新し、失敗(no-video-found等)やタブが見つからない(response === null)場合は
  // 状態を変えない(「実際に何が起きたか分からない」まま推測で書き換えないため)。
  if (response?.ok) {
    await setPausedByExtension(
      tabId,
      nextPausedByExtension(command, response.alreadyInState),
    );
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
  const settings = await getSettings();
  // 拡張機能自体が無効化されている場合(F-20、settings.enabled === false)は、
  // activeタブが対象サイトであってもカメラを起動しない。
  const isTargetActive = settings.enabled && isCameraTargetUrl(url);

  if (isTargetActive === lastKnownIsTargetActive) {
    return;
  }
  lastKnownIsTargetActive = isTargetActive;

  if (isTargetActive) {
    await ensureOffscreenDocument();
    // 起動時点の設定を一緒に渡す(offscreen documentはchrome.storageを直接
    // 読みに行かない設計のため。messages.tsのOffscreenControlMessageの
    // コメント参照)。
    await sendMessage<OffscreenControlMessage>({
      type: "START_CAMERA",
      settings,
    });
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
onTabRemoved((tabId) => {
  recomputeCameraActivation();
  // 閉じたタブ用に保存していたpausedByExtensionの記録を後片付けする
  // (src/shared/chrome/storage.tsのclearPausedByExtension()コメント参照)。
  void clearPausedByExtension(tabId);
});
onStartup(() => {
  recomputeCameraActivation();
});

// optionsページから設定が変更されたときの購読。2つのことを行う。
// 1. F-20のenabled変更を、タブの切り替えを待たずに即座にカメラ起動/停止へ反映する
// 2. カメラが既に起動中のoffscreen documentへ、変更後の設定(判定感度等、F-21)を
//    メッセージで届ける(offscreen document自身はchrome.storageを読みに行かない
//    設計のため。messages.tsのOffscreenControlMessageのコメント参照)
onSettingsChanged((settings) => {
  recomputeCameraActivation();
  pushSettingsToOffscreenIfExists(settings);
});

// pushSettingsToOffscreenIfExists()の呼び出しを直列化するためのPromiseチェーン
// (recomputeQueue/handleStateChangeQueueと同じパターン)。optionsページで複数の
// 設定項目を短時間に連続して変更した場合、hasOffscreenDocument()の非同期待ちの間に
// 呼び出し順が入れ替わり、古い設定のSETTINGS_UPDATEDが新しい設定のものより後に
// 届いてしまう(offscreen documentのcurrentSettingsが一時的に古い値のままになる)
// のを防ぐ。
let pushSettingsQueue: Promise<void> = Promise.resolve();

function pushSettingsToOffscreenIfExists(settings: Settings): void {
  pushSettingsQueue = pushSettingsQueue
    .then(() => doPushSettingsToOffscreenIfExists(settings))
    .catch((error) => {
      console.error(
        `${LOG_PREFIX} pushSettingsToOffscreenIfExistsに失敗:`,
        error,
      );
    });
}

async function doPushSettingsToOffscreenIfExists(
  settings: Settings,
): Promise<void> {
  // offscreen documentがまだ一度も作られていない場合、わざわざ作ってまで
  // 送る必要はない(次にSTART_CAMERAが送られる時に最新の設定が乗るため)。
  if (!(await hasOffscreenDocument())) {
    return;
  }
  await sendMessage<SettingsUpdatedMessage>({
    type: "SETTINGS_UPDATED",
    settings,
  });
}

// offscreen documentからのメッセージ(CONFIRMED_STATE_CHANGED / CAMERA_ERROR)を
// 受け取るリスナー。chrome.runtime.onMessageは拡張機能内の他のメッセージも
// 受信してしまうため、型ガードで自分が処理すべき形かどうかを確認してから処理する。
onMessage((message, _sender, _sendResponse) => {
  if (isConfirmedStateChangedMessage(message)) {
    handleConfirmedStateChange(message.state);
    return false;
  }
  if (isCameraErrorMessage(message)) {
    console.warn(`${LOG_PREFIX} offscreenでカメラエラー: ${message.reason}`);
    return false;
  }
  return false;
});
