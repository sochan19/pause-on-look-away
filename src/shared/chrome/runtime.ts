// このファイルの役割:
// chrome.runtime.* API を薄くラップする。background/content script/offscreen document が
// chrome.* を直接呼ばずここ経由にするのは、テスト時にモックへ差し替えやすくするため
// (アーキテクチャ絶対ルール2)。必要になったAPIが増えるたびにここへ関数を足していく。

import { LOG_PREFIX } from "../constants";

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

/**
 * 拡張機能内の他のコンテキスト(background等)へメッセージを送る。
 * offscreen documentからbackgroundへ確定状態の変化を通知する用途などに使う。
 *
 * background service workerがアイドルで停止していても、sendMessage()は
 * service workerを起こしてから届ける(MV3のイベント駆動の仕組み)ため、
 * 通常は失敗しない想定だが、受け手が存在しない等の異常時にpromiseがrejectする
 * ことがあるため、呼び出し側で毎回try/catchしなくて済むようここでまとめて
 * catchしログだけ出す(sendMessageToTab()と同じ考え方)。
 */
export async function sendMessage<TMessage>(message: TMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn(`${LOG_PREFIX} sendMessage failed:`, error);
  }
}
