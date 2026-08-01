// このファイルの役割:
// 拡張機能アイコンをクリックしたときに開く最小限のpopup。
// カメラ許可の現在の状態を表示し、実際の許可取得はoptionsページ
// (src/options/options.ts)へ誘導する。
//
// なぜここでgetUserMedia()を呼ばないか(DECISIONS.md E章):
// 当初はpopup自身でgetUserMedia()を呼ぶ設計にしていたが、実機検証で
// NotAllowedErrorになることが判明した。popupは「正式なタブ」として扱われない
// ため、Chromeが許可ダイアログを表示できるコンテキストではない。そのため、
// 許可取得の実処理はoptionsページ(通常のタブとして開かれる)に任せ、
// popupは状態表示とoptionsページへの誘導ボタンだけを持つ。
//
// 本格的な設定画面(拡張機能の有効/無効、感度調整、自動再開等)はPhase 7で
// optionsページ側に実装した。popupはこのまま最小限の実装に留める
// (小さいポップアップ内に設定項目を詰め込むと操作しにくくなるため)。

import { openOptionsPage } from "../shared/chrome/runtime";
import { requireNonNull } from "../shared/dom-utils";
import { describeCameraPermissionState } from "../shared/permission-status";

const statusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#status"),
  "popup.htmlに#statusが見つかりません。",
);
const buttonEl = requireNonNull(
  document.querySelector<HTMLButtonElement>("#open-options-button"),
  "popup.htmlに#open-options-buttonが見つかりません。",
);

/**
 * navigator.permissions.query()で現在のカメラ許可状態を確認し、表示を更新する。
 * このAPI自体はpopupから呼んでも問題ない(許可ダイアログを伴わない単なる照会
 * のため)。実際に許可を求める(getUserMedia()を呼ぶ)処理だけがoptionsページ
 * 側の役目になる。
 */
async function refreshPermissionStatus(): Promise<void> {
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    statusEl.textContent = describeCameraPermissionState(
      status.state,
      "設定ページから許可してください。",
    );
  } catch (error) {
    console.warn("[GazePause] カメラ許可状態の確認に失敗:", error);
    statusEl.textContent = "カメラ許可の状態を確認できませんでした。";
  }
}

buttonEl.addEventListener("click", () => {
  void openOptionsPage();
});

void refreshPermissionStatus();
