// このファイルの役割:
// 拡張機能アイコンをクリックしたときに開く最小限のpopup。
// Phase5時点での唯一の役目は「カメラの利用許可を初回に取得すること」。
//
// なぜpopupで許可を取るか(DECISIONS.md E章):
// カメラ判定の実処理はoffscreen document(不可視)で行うが、offscreen documentは
// フォーカスできないページのため、getUserMedia()の許可ダイアログを自力で表示できない
// (Chrome公式ドキュメント・GoogleChrome社のissueで確認済みの制約)。そのため、
// 「popup(可視・ユーザー操作あり)で一度だけ許可を取る → 以後は同じ拡張機能の
// オリジン(chrome-extension://<id>)なのでoffscreen documentからの呼び出しも
// 許可ダイアログなしで成功する」という流れにする。
//
// 本格的な設定画面(カメラON/OFF、感度調整等)はPhase 7で実装する。このpopupは
// その土台であり、今は許可取得ボタン1つだけを持つ最小限の実装にとどめる。

import { requireNonNull } from "../shared/dom-utils";

const statusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#status"),
  "popup.htmlに#statusが見つかりません。",
);
const buttonEl = requireNonNull(
  document.querySelector<HTMLButtonElement>("#request-permission-button"),
  "popup.htmlに#request-permission-buttonが見つかりません。",
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
    renderStatus(status.state);
  } catch (error) {
    console.warn("[Gaze-Aware Playback] カメラ許可状態の確認に失敗:", error);
    statusEl.textContent = "カメラ許可の状態を確認できませんでした。";
  }
}

function renderStatus(state: PermissionState): void {
  switch (state) {
    case "granted":
      statusEl.textContent = "カメラ: 許可済み";
      buttonEl.textContent = "再確認する";
      break;
    case "denied":
      statusEl.textContent =
        "カメラ: 拒否されています。ブラウザのサイト設定から許可してください。";
      break;
    default:
      statusEl.textContent =
        "カメラ: 未許可です。下のボタンから許可してください。";
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
