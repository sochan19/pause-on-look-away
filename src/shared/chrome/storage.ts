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

// ここから下は、視線復帰時の自動再開(F-11)を正しく判定するための、
// タブごとの一時的な状態をchrome.storage.sessionに保存する関数。
//
// なぜ chrome.storage.sync ではなく session なのか:
// この値(「今一時停止しているのはユーザー操作ではなく拡張機能自身か」)は、
// 端末をまたいで同期したいユーザー設定ではなく、あくまで今のブラウザセッション
// 限りの内部状態。service-worker.tsのモジュール変数(let)で持たない理由は、
// MV3のservice workerがアイドルで頻繁に終了・再起動されるため
// (このプロジェクトの他の場所にもある注釈と同じ理由)。ただし今回はモジュール変数の
// 「消えても次のイベントで再計算すればよい」という前提が当てはまらない
// (「拡張機能が一時停止させた」という事実は、後から再計算しようがないため)。
// chrome.storage.sessionはservice worker再起動をまたいで値を保持しつつ、
// ブラウザを閉じれば消える(sync/localと違いディスクに書き込まれない)ため、
// この用途に合っている。
//
// なぜタブIDをキーにするのか:
// この状態はタブ単位で意味を持つ(あるタブで拡張機能が一時停止させた動画を、
// 別のタブをresumeする際に誤って参照しないようにするため)。

const PAUSED_BY_EXTENSION_KEY_PREFIX = "pausedByExtension:";

/**
 * 指定したタブについて、「今一時停止しているのは拡張機能自身か」を読み込む。
 * まだ記録が無い場合(初回、または既にfalseとして削除済み)はfalseを返す。
 */
export async function getPausedByExtension(tabId: number): Promise<boolean> {
  const key = `${PAUSED_BY_EXTENSION_KEY_PREFIX}${tabId}`;
  try {
    const result = await chrome.storage.session.get(key);
    return result[key] === true;
  } catch (error) {
    // getSettings()と同じく、失敗時は安全側(=自動再開しない)のfalseにフォールバックする。
    console.warn(
      `${LOG_PREFIX} getPausedByExtension failed. falseとして扱います:`,
      error,
    );
    return false;
  }
}

/**
 * 指定したタブについて、「今一時停止しているのは拡張機能自身か」を保存する。
 * falseを保存する代わりにキー自体を削除する。タブを開閉するたびにキーが
 * 積み上がり続けるのを防ぐため(falseは「記録が無い」ときのデフォルト値と
 * 同じ意味なので、明示的に保存しておく必要が無い)。
 *
 * saveSettings()と違い、ここではあえて内部でcatchする。saveSettings()は
 * ユーザー操作(options.tsのボタン等)を起点に呼ばれ、失敗をUIへ
 * 「保存に失敗しました」と表示できる文脈だが、この関数はservice-worker.ts内部の
 * バックグラウンド処理から呼ばれ、失敗をユーザーへ見せる手段が無い。そのため
 * getSettings()と同じ「ここでまとめてcatchし、ログだけ出す」方針にする。
 */
export async function setPausedByExtension(
  tabId: number,
  pausedByExtension: boolean,
): Promise<void> {
  const key = `${PAUSED_BY_EXTENSION_KEY_PREFIX}${tabId}`;
  try {
    if (pausedByExtension) {
      await chrome.storage.session.set({ [key]: true });
    } else {
      await chrome.storage.session.remove(key);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} setPausedByExtension failed:`, error);
  }
}

/**
 * タブが閉じられたときに、そのタブ用のpausedByExtensionの記録を掃除する。
 * 呼ばなくても動作上の実害は無い(未使用キーが残るだけ)が、長時間の利用で
 * chrome.storage.sessionにタブID分のキーが積み上がり続けるのを避けるための後片付け。
 */
export async function clearPausedByExtension(tabId: number): Promise<void> {
  await setPausedByExtension(tabId, false);
}
