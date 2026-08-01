// このファイルの役割:
// background service worker が他のコンテキスト(content script, offscreen document)
// とやり取りするメッセージの型と種別をまとめて定義する。マジック文字列("pause"等)を
// あちこちに書き散らすと、typoで気づかないうちに動かなくなることがあるため、型と
// リテラルをここに集約する(code-reviewerの「マジック文字列/数値がsrc/shared/constants
// に定義されているか」チェック項目と同じ考え方を、メッセージの型についても適用したもの)。

import { isSettings, type Settings } from "./settings";
import type { ConfirmedState } from "./viewing-state";

// 動画に対して実行してほしい操作。"pause" = 一時停止、"resume" = 再生再開。
export type PlaybackCommand = "pause" | "resume";

// background → content script へ送るメッセージの形。
// type: "SET_PLAYBACK" という判別用のフィールドを持たせているのは、
// 将来メッセージの種類が増えたときに受信側で switch(message.type) のように
// 振り分けられるようにするため(判別可能ユニオン型、discriminated union)。
export interface SetPlaybackMessage {
  type: "SET_PLAYBACK";
  command: PlaybackCommand;
}

// content scriptからのレスポンス。
// pause/playを実行できなかった場合にreasonを持たせることで、background側の
// ログで「なぜ効かなかったか」に気づけるようにする。
// (Phase6でPrime Video除外を撤去したことに伴い、"unsupported-site"は生成元が
// 無くなったため型からも削除した。content scriptはYouTube/Prime Video以外には
// 注入されない=manifest.jsonのcontent_scripts.matchesで保証されているため)
//
// alreadyInState: 「そのpause/resume命令を実行する前から、video要素が既に
// 目的の状態だったか」を表す(pauseなら実行前からpaused、resumeなら実行前から
// 再生中だった場合にtrue)。background側がF-11(自動再開)を正しく判断するために
// 必要な情報: 「拡張機能自身がpauseさせて再生中→一時停止という状態変化を
// 実際に起こした動画」と「ユーザーが自分の意思で既に一時停止していた動画」を
// 区別できないと、視線が戻っただけでユーザーが手動で止めた動画まで勝手に
// 再生してしまうバグになる(実機検証で発見)。
export type SetPlaybackResponse =
  | { ok: true; alreadyInState: boolean }
  | { ok: false; reason: "no-video-found" };

// chrome.runtime.onMessageは、拡張機能内の別コンテキスト同士でやり取りされる
// メッセージを(自分宛てかどうかに関わらず)すべて受信してしまう。
// そのため受信側で「本当にSetPlaybackMessageの形をしているか」を確認する
// 型ガードを用意する。chrome API/DOMに依存しない純粋関数なのでVitestでテストできる。
export function isSetPlaybackMessage(
  message: unknown,
): message is SetPlaybackMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown; command?: unknown };
  return (
    candidate.type === "SET_PLAYBACK" &&
    (candidate.command === "pause" || candidate.command === "resume")
  );
}

// chrome.tabs.sendMessageの戻り値も、TypeScriptの型注釈上は信じられるように
// 見えるが実際にはただの`unknown`(相手が何を返してくるかは実行時までわからない)。
// background側でレスポンスの中身(response.ok等)を条件分岐に使う処理を
// 今後追加する際に、誤った形のレスポンスを信じて壊れないよう、受信メッセージと
// 対称的にレスポンス側にも型ガードを用意しておく。
export function isSetPlaybackResponse(
  response: unknown,
): response is SetPlaybackResponse {
  if (typeof response !== "object" || response === null) {
    return false;
  }
  const candidate = response as {
    ok?: unknown;
    reason?: unknown;
    alreadyInState?: unknown;
  };
  if (candidate.ok === true) {
    return typeof candidate.alreadyInState === "boolean";
  }
  return candidate.ok === false && candidate.reason === "no-video-found";
}

// ここから下はPhase5(offscreen document)で追加したbackground⇔offscreen間の
// メッセージ。SetPlaybackMessageと同じ「判別可能ユニオン型 + 型ガード」の
// パターンを踏襲する。

// background → offscreen: カメラストリームの開始/停止を指示する。
// offscreen document自体は常駐させ続け(モデルの再読み込みコストを避けるため)、
// activeタブがカメラ判定の対象サイト(YouTube/Prime Video)かどうかに応じて
// このメッセージでカメラの物理的なON/OFFだけを切り替える(DECISIONS.md E-2)。
//
// START_CAMERAにsettingsを持たせている理由(実機検証で発見した不具合への対応):
// 当初はoffscreen documentが自分でchrome.storage.sync(getSettings/
// onSettingsChanged)を呼んで判定感度(F-21)を取得する設計にしていたが、
// Surface実機で「offscreen document内でだけchrome.storage自体がundefinedになる」
// (Chrome側の権限バインディングのタイミングによると見られる)事象が、拡張機能を
// 完全に削除・再読み込みしても再発することを確認した。この状態では
// getSettings()は安全にデフォルト値へフォールバックするものの、結果として
// 「ユーザーが設定画面で角度・フレーム数を変更しても検出ループに一切反映されない」
// という不具合になっていた。
// backgroundのchrome.storageアクセスは同じ実機検証で安定して動作することを
// 確認済みのため、offscreen document側はchrome.storageに一切触れず、
// 代わりにbackgroundから(START_CAMERAおよびSETTINGS_UPDATEDメッセージで)
// 設定を「push」してもらう設計に変更した。
export type OffscreenControlMessage =
  | { type: "START_CAMERA"; settings: Settings }
  | { type: "STOP_CAMERA" };

export function isOffscreenControlMessage(
  message: unknown,
): message is OffscreenControlMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown; settings?: unknown };
  if (candidate.type === "START_CAMERA") {
    return isSettings(candidate.settings);
  }
  return candidate.type === "STOP_CAMERA";
}

// background → offscreen: 現在の設定(判定感度・自動再開等)が変わったことを伝える。
// カメラが既に起動中(START_CAMERA済み)の間に、ユーザーがoptionsページで設定を
// 変更した場合に、offscreen documentの検出ループへ即座に反映させるために使う
// (START_CAMERA時点の設定は上記OffscreenControlMessageに乗せて渡すため、
// このメッセージは「起動中の設定変更」専用)。
export interface SettingsUpdatedMessage {
  type: "SETTINGS_UPDATED";
  settings: Settings;
}

export function isSettingsUpdatedMessage(
  message: unknown,
): message is SettingsUpdatedMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown; settings?: unknown };
  return (
    candidate.type === "SETTINGS_UPDATED" && isSettings(candidate.settings)
  );
}

// offscreen → background: ヒステリシス状態機械(viewing-state.ts)の確定状態が
// 変化したときに送る。backgroundはこれを受け取ってhandleConfirmedStateChange()を呼び、
// pause/resumeメッセージをcontent scriptへ中継する。
export interface ConfirmedStateChangedMessage {
  type: "CONFIRMED_STATE_CHANGED";
  state: ConfirmedState;
}

export function isConfirmedStateChangedMessage(
  message: unknown,
): message is ConfirmedStateChangedMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown; state?: unknown };
  return (
    candidate.type === "CONFIRMED_STATE_CHANGED" &&
    (candidate.state === "looking" || candidate.state === "away")
  );
}

// offscreen → background: getUserMedia()の失敗(未許可・カメラが他アプリで
// 使用中等)をbackground側のログで追えるようにするためのメッセージ。
// Phase5時点ではconsole.warnするだけだが、将来popup等で状態表示する際の
// 入り口として型を用意しておく。
export interface CameraErrorMessage {
  type: "CAMERA_ERROR";
  reason: string;
}

export function isCameraErrorMessage(
  message: unknown,
): message is CameraErrorMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown; reason?: unknown };
  return (
    candidate.type === "CAMERA_ERROR" && typeof candidate.reason === "string"
  );
}
