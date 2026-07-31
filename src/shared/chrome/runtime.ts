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
