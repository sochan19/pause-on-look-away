// このファイルの役割:
// YouTube / Prime Video に自動注入されるcontent scriptのエントリポイント。
// Phase 3時点ではまだvideo要素のpause/play制御は実装せず(Phase 4で対応)、
// 「正しいサイトで、正しく注入されたこと」をログで確認できる最小限の内容にする。
// YouTubeとPrime Videoで内容がまだ同じなので、今はファイルを分けずに1つにまとめている
// (差が出てくるPhase 4で分割を再検討する)。

import { LOG_PREFIX } from "../shared/constants";
import { identifySite } from "../shared/site-detection";

const site = identifySite(location.hostname);

console.log(
  `${LOG_PREFIX} content script loaded on ${location.hostname} (site=${site})`,
);
