// このファイルの役割:
// background service worker のエントリポイント。Phase 3時点ではまだ
// 状態管理(視聴中/非視聴判定の保持)やcontent scriptとのメッセージ中継は実装せず、
// 「拡張機能として読み込まれ、正しく起動すること」だけを確認できる最小限の内容にする。
//
// service worker はMV3の仕様上アイドル状態が続くと自動的に停止・破棄される
// (裏で常駐し続けるわけではない)。そのため、モジュールスコープの変数に状態を
// 持たせても次に起動した時には消えている前提で設計する必要がある
// (Phase 4以降で状態を持つ場合は chrome.storage への保存を検討する)。

import { onInstalled } from "../shared/chrome/runtime";
import { LOG_PREFIX } from "../shared/constants";

console.log(`${LOG_PREFIX} service worker starting up`);

onInstalled((details) => {
  console.log(`${LOG_PREFIX} onInstalled: reason=${details.reason}`);
});
