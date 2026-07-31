// このファイルの役割:
// background service worker が他のコンテキスト(content script, offscreen document)
// とやり取りするメッセージの型と種別をまとめて定義する。マジック文字列("pause"等)を
// あちこちに書き散らすと、typoで気づかないうちに動かなくなることがあるため、型と
// リテラルをここに集約する(code-reviewerの「マジック文字列/数値がsrc/shared/constants
// に定義されているか」チェック項目と同じ考え方を、メッセージの型についても適用したもの)。

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
export type SetPlaybackResponse =
  | { ok: true }
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
  const candidate = response as { ok?: unknown; reason?: unknown };
  if (candidate.ok === true) {
    return true;
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
export type OffscreenControlMessage =
  | { type: "START_CAMERA" }
  | { type: "STOP_CAMERA" };

export function isOffscreenControlMessage(
  message: unknown,
): message is OffscreenControlMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as { type?: unknown };
  return candidate.type === "START_CAMERA" || candidate.type === "STOP_CAMERA";
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
