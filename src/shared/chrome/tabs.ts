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
 * 現在アクティブなタブのURLを取得する。
 * background側で「activeタブがカメラ判定の対象サイトか」を判定する際に使う
 * (site-detection.tsのisCameraTargetUrl()に渡す)。
 * URLが取得できない場合(該当タブが無い、host_permissionsが無いドメイン等)は
 * undefinedを返す。
 */
export async function getActiveTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab?.url;
}

// タブの状態が変わりうるタイミング(切り替え・URL変化・削除)をまとめて監視するための
// 薄いラッパー。呼び出し側(service-worker.ts)は「何が変わったか」の詳細を見るのではなく、
// これらのイベントをきっかけに毎回「今のactiveタブは対象サイトか」を再計算する設計にする
// (content scriptがSPA遷移のたびにDOMを再クエリするE-5決定事項と同じ考え方: イベントの
// 詳細を信じてキャッシュを差分更新するより、都度re-queryする方がシンプルでズレにくい)。

export function onTabActivated(handler: () => void): void {
  chrome.tabs.onActivated.addListener(handler);
}

export function onTabUpdated(handler: () => void): void {
  chrome.tabs.onUpdated.addListener(handler);
}

export function onTabRemoved(handler: () => void): void {
  chrome.tabs.onRemoved.addListener(handler);
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
