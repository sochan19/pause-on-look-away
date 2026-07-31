// このファイルの役割:
// chrome.offscreen APIを薄くラップする。理由は他のchrome/*.tsファイルと同じで、
// background service workerがchrome.*を直接呼ばずここ経由にすることで、
// テスト時にモックへ差し替えやすくするため(アーキテクチャ絶対ルール2)。

// offscreen documentのHTMLファイルの場所(manifest.json基準の相対パス)。
// service workerからも(このファイル経由で)、Vite/@crxjs/vite-pluginのビルド設定からも
// 同じパスを指すため、ここに集約してタイプミスを防ぐ。
const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";

/**
 * offscreen documentが既に存在するかどうかを返す。
 * 「対象サイトではなくなったのでカメラを止めたいが、そもそもoffscreen document自体が
 * まだ作られていないなら何もしなくてよい」という判断にbackground側で使う。
 */
export async function hasOffscreenDocument(): Promise<boolean> {
  return chrome.offscreen.hasDocument();
}

/**
 * offscreen documentが存在することを保証する。
 *
 * chrome拡張機能は同時に1つのoffscreen documentしか持てない仕様のため、
 * 既に存在する場合に再度createDocument()を呼ぶとエラーになる。
 * background service workerはアイドル状態で何度も再起動されうるが、
 * offscreen document自体はservice workerのライフサイクルと独立して存在し続けるため、
 * 「無ければ作る」という冪等な呼び出し方にしておくことで、service worker再起動後も
 * 安全に呼び出せる。
 */
export async function ensureOffscreenDocument(): Promise<void> {
  const alreadyExists = await chrome.offscreen.hasDocument();
  if (alreadyExists) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["USER_MEDIA"],
    justification:
      "Webカメラの映像から顔の向きを判定し、動画の一時停止/再開を行うため",
  });
}
