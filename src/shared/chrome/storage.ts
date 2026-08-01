// このファイルの役割:
// chrome.storage.sync APIを薄くラップする。理由は他のchrome/*.tsファイルと同じで、
// background/offscreen/optionsがchrome.*を直接呼ばずここ経由にすることで、
// テスト時にモックへ差し替えやすくするため(アーキテクチャ絶対ルール2)。
// 「設定の型・デフォルト値」はsrc/shared/settings.tsに分離してあり、
// このファイルは「それをどう読み書きするか」だけを担当する。

import { LOG_PREFIX } from "../constants";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

/**
 * 現在保存されている設定を読み込む。
 *
 * chrome.storage.sync.get(defaults)は「渡したオブジェクトのキーのうち、
 * storageにまだ値が無いものはdefaultsの値で埋めて返す」という組み込みの挙動を持つ。
 * これを利用することで、初回インストール直後(まだ何も保存していない)でも
 * DEFAULT_SETTINGSの値がそのまま返る。
 */
export async function getSettings(): Promise<Settings> {
  try {
    return await chrome.storage.sync.get<Settings>(DEFAULT_SETTINGS);
  } catch (error) {
    // offscreen/service workerはこの関数の失敗をユーザーへ見せる手段を持たず、
    // かつ判定処理は止められないため、runtime.ts/tabs.tsの他の関数と同じく
    // ここでまとめてcatchし、安全側のデフォルト値にフォールバックする。
    console.warn(
      `${LOG_PREFIX} getSettings failed. デフォルト値にフォールバックします:`,
      error,
    );
    return DEFAULT_SETTINGS;
  }
}

/**
 * 設定の一部を保存する。
 *
 * 呼び出し側(options.ts)は変更があった項目だけをPartial<Settings>として渡す。
 * chrome.storage.sync.set()は渡されたキーだけを更新し、他のキーはそのまま残す
 * ため、ここで既存の設定と手動でマージする必要はない。
 *
 * getSettings()と違い、ここではあえて例外をcatchしない。保存の成否はユーザーへ
 * フィードバックすべき情報(options.ts側で「保存しました」/「失敗しました」を
 * 出し分ける)であり、ここで握りつぶしてしまうと保存が失敗したのに画面上は
 * 成功したように見えてしまうため、呼び出し側で明示的に扱ってもらう。
 */
export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set<Settings>(partial);
}

/**
 * 設定が変化したときに呼ばれるハンドラを登録する。
 *
 * chrome.storage.onChangedは「何のキーがどう変わったか」の差分を渡してくるが、
 * このプロジェクトでは差分を自分で組み立てず、変化のたびにgetSettings()で
 * 最新の完全なSettingsを取り直してhandlerに渡す設計にする(content scriptが
 * SPA遷移のたびにDOMを再クエリするのと同じ「都度re-queryする」考え方。
 * DECISIONS.md E-5決定事項を参照)。areaNameが"sync"以外("local"等)の変化は
 * このプロジェクトでは使っていないため無視する。
 *
 * この関数はoffscreen.ts/service-worker.tsのモジュール読み込み時(トップレベル)
 * から呼ばれる。実機検証で、offscreen documentが作られた直後のタイミングでは
 * 稀に chrome.storage 自体がまだ undefined になっていることが確認された
 * (Chrome側の権限バインディングの反映タイミングによる一時的な状態と見られる)。
 * ここでtry/catchせずに例外を投げてしまうと、呼び出し元のモジュール全体の
 * 読み込みがそこで止まり、その後に書かれているonMessage()の登録(カメラの
 * START_CAMERA/STOP_CAMERA受信という中核機能)まで巻き込んで動かなくなって
 * しまう。「設定の自動反映」という副次的な機能の初期化失敗が、動画一時停止
 * という主機能を道連れにしないよう、ここで確実に失敗を吸収する。
 */
export function onSettingsChanged(handler: (settings: Settings) => void): void {
  try {
    chrome.storage.onChanged.addListener((_changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }
      // getSettings()は内部でエラーを握りつぶしデフォルト値にフォールバックするため
      // (上記参照)、ここで改めてcatchする必要はない。
      void getSettings().then(handler);
    });
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} onSettingsChanged: リスナー登録に失敗しました。設定の自動反映は無効になります:`,
      error,
    );
  }
}
