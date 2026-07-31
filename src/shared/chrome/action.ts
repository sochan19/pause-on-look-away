// このファイルの役割:
// chrome.action(拡張機能アイコン)のクリックイベントを薄くラップする。
//
// 【Phase4時点の一時的な使い道について】
// 本来はPhase5で実装するカメラの視線判定結果(ヒステリシス状態機械の確定状態)が
// 「視聴/非視聴が切り替わった」ことの本当のトリガーになる予定だが、Phase4時点では
// カメラ処理(offscreen document)がまだ無い。そのため、拡張機能アイコンのクリックを
// 「状態が切り替わった」ことの仮のトリガーとして使い、background→content scriptの
// pause/resume中継ロジック(service-worker.tsのhandleConfirmedStateChange)が
// 実際に動くことを手動確認できるようにしている。
// Phase5でカメラ判定からのトリガーに置き換わったら、この仕組みは削除するか、
// 開発用フラグの裏に隠す想定(要手動確認・docs/manual-test.md参照)。
export function onActionClicked(handler: (tab: chrome.tabs.Tab) => void): void {
  chrome.action.onClicked.addListener(handler);
}
