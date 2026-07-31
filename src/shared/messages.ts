// このファイルの役割:
// background service worker と content script の間でやり取りするメッセージの
// 型と種別をまとめて定義する。マジック文字列("pause"等)をあちこちに書き散らすと、
// typoで気づかないうちに動かなくなることがあるため、型とリテラルをここに集約する
// (code-reviewerの「マジック文字列/数値がsrc/shared/constantsに定義されているか」
// チェック項目と同じ考え方を、メッセージの型についても適用したもの)。

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
export type SetPlaybackResponse =
  | { ok: true }
  | { ok: false; reason: "no-video-found" | "unsupported-site" };

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
  return (
    candidate.ok === false &&
    (candidate.reason === "no-video-found" ||
      candidate.reason === "unsupported-site")
  );
}
