// このファイルの役割:
// 拡張機能の設定ページ本体(manifest.jsonのoptions_ui、open_in_tab: trueにより
// 通常のブラウザタブとして開かれる)。役目は2つ:
//
// 1. カメラの利用許可を初回に取得すること(Phase5から)
// 2. 拡張機能の動作設定(有効/無効・判定感度・自動再開)をchrome.storage.sync経由で
//    読み書きすること(Phase7、F-20/F-21)
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
// 設定項目は(popupの見た目を小さく保つため)すべてこのoptionsページに集約する。
// popup.tsは現在も今後も、許可状態の表示とこのページへの誘導ボタンだけを持つ
// 最小限の実装のままにする。

import { getSettings, saveSettings } from "../shared/chrome/storage";
import { requireNonNull } from "../shared/dom-utils";
import { describeCameraPermissionState } from "../shared/permission-status";
import {
  CONFIRMATION_FRAME_COUNT_MAX,
  CONFIRMATION_FRAME_COUNT_MIN,
  clampSettingNumber,
  DEFAULT_SETTINGS,
  FACING_THRESHOLD_MAX_DEG,
  FACING_THRESHOLD_MIN_DEG,
  type Settings,
} from "../shared/settings";

const statusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#status"),
  "options.htmlに#statusが見つかりません。",
);
const buttonEl = requireNonNull(
  document.querySelector<HTMLButtonElement>("#request-permission-button"),
  "options.htmlに#request-permission-buttonが見つかりません。",
);

const enabledCheckbox = requireNonNull(
  document.querySelector<HTMLInputElement>("#enabled-checkbox"),
  "options.htmlに#enabled-checkboxが見つかりません。",
);
const facingThresholdInput = requireNonNull(
  document.querySelector<HTMLInputElement>("#facing-threshold-input"),
  "options.htmlに#facing-threshold-inputが見つかりません。",
);
const confirmationFrameCountInput = requireNonNull(
  document.querySelector<HTMLInputElement>("#confirmation-frame-count-input"),
  "options.htmlに#confirmation-frame-count-inputが見つかりません。",
);
const autoResumeCheckbox = requireNonNull(
  document.querySelector<HTMLInputElement>("#auto-resume-checkbox"),
  "options.htmlに#auto-resume-checkboxが見つかりません。",
);
const settingsStatusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#settings-status"),
  "options.htmlに#settings-statusが見つかりません。",
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

// ここから下がPhase7で追加した設定UI(F-20, F-21)。

// 数値入力欄のmin/max属性を、settings.tsで定義した境界値定数から設定する。
// HTML側に同じ数値を直接書くと、将来境界値を変更した際にHTMLとTypeScriptの
// 両方を書き換え忘れる恐れがあるため、TypeScript側の定数を単一の情報源にする。
facingThresholdInput.min = String(FACING_THRESHOLD_MIN_DEG);
facingThresholdInput.max = String(FACING_THRESHOLD_MAX_DEG);
confirmationFrameCountInput.min = String(CONFIRMATION_FRAME_COUNT_MIN);
confirmationFrameCountInput.max = String(CONFIRMATION_FRAME_COUNT_MAX);

/**
 * chrome.storage.syncに保存されている現在の設定を読み込み、フォームへ反映する。
 * ページを開くたびに呼ぶ(他の端末で変更された設定が同期されているケースにも対応)。
 */
async function loadSettingsIntoForm(): Promise<void> {
  const settings = await getSettings();
  enabledCheckbox.checked = settings.enabled;
  facingThresholdInput.value = String(settings.facingThresholdDeg);
  confirmationFrameCountInput.value = String(settings.confirmationFrameCount);
  autoResumeCheckbox.checked = settings.autoResumeEnabled;
}

/**
 * 設定の一部を保存し、保存できたことがわかるよう画面に一時的なメッセージを出す。
 *
 * 保存ボタンは置かず、コントロールを変更したら即座に保存する作りにしてある
 * (初心者向けにシンプルなUXを優先。「保存を押し忘れて設定が反映されない」という
 * 混乱も避けられる)。background(service-worker.ts)側はchrome.storage.onChangedを
 * 購読しているため、保存した瞬間にカメラ起動判定・判定感度へ反映される想定
 * (要手動確認: docs/manual-test.md「設定 UI」)。
 */
async function saveSettingsAndShowStatus(
  partial: Partial<Settings>,
): Promise<void> {
  // saveSettings()はあえて内部でエラーをcatchしない設計(storage.tsのコメント参照)
  // のため、ここで保存の成否をユーザーに正しく伝える。
  try {
    await saveSettings(partial);
    settingsStatusEl.textContent = "保存しました";
  } catch (error) {
    console.warn("[Gaze-Aware Playback] 設定の保存に失敗:", error);
    settingsStatusEl.textContent = "保存に失敗しました。";
  }
  // 2秒後にメッセージを消す。消し忘れて表示されっぱなしになる
  // (別の設定を変えても同じ文言のままで、本当に保存されたか分かりにくくなる)のを防ぐ。
  window.setTimeout(() => {
    settingsStatusEl.textContent = "";
  }, 2000);
}

enabledCheckbox.addEventListener("change", () => {
  void saveSettingsAndShowStatus({ enabled: enabledCheckbox.checked });
});

facingThresholdInput.addEventListener("change", () => {
  // <input type="number">のmin/max属性はユーザーの手入力(範囲外の数値やカラ欄)を
  // 強制的に防いではくれないため、保存前に必ずclampSettingNumber()を通す。
  const value = clampSettingNumber(
    facingThresholdInput.valueAsNumber,
    FACING_THRESHOLD_MIN_DEG,
    FACING_THRESHOLD_MAX_DEG,
    DEFAULT_SETTINGS.facingThresholdDeg,
  );
  // クランプ後の値を入力欄の表示にも反映する。範囲外の値を入れてしまった場合に、
  // 実際に保存された値との食い違いに気づけるようにするため。
  facingThresholdInput.value = String(value);
  void saveSettingsAndShowStatus({ facingThresholdDeg: value });
});

confirmationFrameCountInput.addEventListener("change", () => {
  const value = clampSettingNumber(
    confirmationFrameCountInput.valueAsNumber,
    CONFIRMATION_FRAME_COUNT_MIN,
    CONFIRMATION_FRAME_COUNT_MAX,
    DEFAULT_SETTINGS.confirmationFrameCount,
  );
  confirmationFrameCountInput.value = String(value);
  void saveSettingsAndShowStatus({ confirmationFrameCount: value });
});

autoResumeCheckbox.addEventListener("change", () => {
  void saveSettingsAndShowStatus({
    autoResumeEnabled: autoResumeCheckbox.checked,
  });
});

void loadSettingsIntoForm();
