// このファイルの役割:
// chrome.tabs.* APIを薄くラップする。理由はruntime.tsと同じで、
// background/content scriptがchrome.*を直接呼ばずここ経由にすることで、
// テスト時にモックへ差し替えやすくするため(アーキテクチャ絶対ルール2)。

import { LOG_PREFIX } from "../constants";

/**
 * 現在アクティブなタブのIDを取得する。
 * 見つからない場合(該当ウィンドウが無い等の特殊な状態)はnullを返す。
 */
export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab?.id ?? null;
}

/**
 * 指定したタブのcontent scriptへメッセージを送る。
 *
 * content scriptが存在しないタブ(対象外サイト、まだ注入されていない、
 * タブが閉じられた直後 等)に送るとchrome.tabs.sendMessageは例外を投げる
 * ("Receiving end does not exist"等)。これは異常事態ではなく普通に起こりうるため、
 * 呼び出し側が毎回try/catchしなくて済むよう、ここでまとめてcatchしてnullを返す。
 */
export async function sendMessageToTab<TMessage, TResponse>(
  tabId: number,
  message: TMessage,
): Promise<TResponse | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} sendMessageToTab failed (tabId=${tabId}):`,
      error,
    );
    return null;
  }
}
