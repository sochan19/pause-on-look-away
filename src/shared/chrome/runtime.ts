// このファイルの役割:
// chrome.runtime.* API を薄くラップする。background/content script が
// chrome.* を直接呼ばずここ経由にするのは、テスト時にモックへ差し替えやすくするため
// (アーキテクチャ絶対ルール2)。今はonInstalledのラップだけ用意し、
// 必要になったAPIが増えるたびにここへ関数を足していく。

// chrome.runtime.onInstalled は「拡張機能が新規インストール/更新/Chrome自体の更新」
// されたタイミングで1回だけ発火するイベント。起動確認や初期化処理のきっかけに使う。
export function onInstalled(
  handler: (details: chrome.runtime.InstalledDetails) => void,
): void {
  chrome.runtime.onInstalled.addListener(handler);
}

// chrome.runtime.onMessage は、拡張機能内の別コンテキスト(background⇔content script等)
// からのメッセージを受信するイベント。ハンドラの戻り値でtrueを返すと「sendResponseを
// 非同期に呼ぶ」ことをChromeに伝えられる仕様のため、型もそれに合わせてある
// (このプロジェクトではsendResponseを同期的に呼ぶだけなので、常にfalseを返す想定)。
export function onMessage(
  handler: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean,
): void {
  chrome.runtime.onMessage.addListener(handler);
}
