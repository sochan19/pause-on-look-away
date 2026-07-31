// このファイルの役割:
// 拡張機能の設定ページ本体(manifest.jsonのoptions_ui、open_in_tab: trueにより
// 通常のブラウザタブとして開かれる)。Phase5時点での唯一の役目は
// 「カメラの利用許可を初回に取得すること」。
//
// なぜpopupではなくoptionsページで許可を取るか(DECISIONS.md E章):
// 当初はpopup(拡張機能アイコンをクリックしたときに開く小さいウィンドウ)で
// getUserMedia()を呼ぶ設計にしていたが、実機検証でNotAllowedErrorになることが
// 判明した。popupは「正式なタブ」として扱われないため、Chromeが許可ダイアログを
// 表示できるコンテキストではない(popupから呼ぶと、ユーザーに何も確認せず
// 即座に拒否される)。この制約は複数の情報源(Chrome拡張機能の実装事例)で
// 裏付けが取れている。
// optionsページはmanifest.jsonのoptions_ui.open_in_tab: trueにより通常の
// ブラウザタブとして開かれるため、getUserMedia()の許可ダイアログを正常に表示できる。
//
// 許可を取得した後は、offscreen document(src/offscreen/offscreen.ts)が
// 同じ拡張機能のオリジン(chrome-extension://<id>)から呼び出すため、
// 許可ダイアログなしで成功する想定(要手動確認)。
//
// 本格的な設定画面(カメラON/OFF、感度調整等)はPhase 7で実装する。この
// optionsページはその土台であり、今は許可取得ボタン1つだけを持つ最小限の実装に
// とどめる。

import { requireNonNull } from "../shared/dom-utils";
import { describeCameraPermissionState } from "../shared/permission-status";

const statusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#status"),
  "options.htmlに#statusが見つかりません。",
);
const buttonEl = requireNonNull(
  document.querySelector<HTMLButtonElement>("#request-permission-button"),
  "options.htmlに#request-permission-buttonが見つかりません。",
);

/**
 * navigator.permissions.query()で現在のカメラ許可状態を確認し、表示を更新する。
 *
 * 注意: すべてのブラウザ/権限名がPermissions APIに対応しているとは限らないため、
 * 失敗してもエラーで壊れず「未確認」の表示に留める(このAPIが使えなくても、
 * 下のボタンからgetUserMedia()を直接呼ぶ経路自体は動く)。
 */
async function refreshPermissionStatus(): Promise<void> {
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    statusEl.textContent = describeCameraPermissionState(
      status.state,
      "下のボタンから許可してください。",
    );
    buttonEl.textContent =
      status.state === "granted" ? "再確認する" : "カメラを許可する";
  } catch (error) {
    console.warn("[Gaze-Aware Playback] カメラ許可状態の確認に失敗:", error);
    statusEl.textContent = "カメラ許可の状態を確認できませんでした。";
  }
}

buttonEl.addEventListener("click", () => {
  void requestCameraPermission();
});

/**
 * ボタンクリック(ユーザー操作)を契機にgetUserMedia()を呼び、許可ダイアログを
 * 表示させる。ここでは許可を得ることだけが目的で、映像自体は使わないため、
 * 成功したら即座にトラックを止める(カメラをつけっぱなしにしないため。N-02)。
 * 実際のカメラ利用はこの後offscreen documentが行う。
 */
async function requestCameraPermission(): Promise<void> {
  buttonEl.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await refreshPermissionStatus();
  } catch (error) {
    console.warn("[Gaze-Aware Playback] カメラ許可の取得に失敗:", error);
    statusEl.textContent = "カメラの許可を取得できませんでした。";
  } finally {
    buttonEl.disabled = false;
  }
}

void refreshPermissionStatus();
