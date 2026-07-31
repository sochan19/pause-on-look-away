// このファイルの役割:
// 実際のDOM(document)からvideo要素を取得し、shared/video-selection.tsの
// 純粋関数を使って「制御すべき1つのvideo要素」を決定する。
// DOM操作(querySelectorAll, offsetWidth等)を含むためVitestで単体テストは
// できないが、選定ロジック自体(selectPrimaryVideoIndex)は分離済みなので
// そちらでテストしている(アーキテクチャ絶対ルール1)。
// content scriptがdocument.querySelector('video')を直接使わないようにする
// ためのユーティリティ本体でもある(アーキテクチャ絶対ルール5: YouTubeは
// ホバープレビュー等でvideo要素が複数存在しうるため)。

import {
  selectPrimaryVideoIndex,
  type VideoElementInfo,
} from "../shared/video-selection";

// HTMLVideoElementから、選定ロジックが必要とする情報だけを取り出す。
// offsetWidth/offsetHeightは、要素がdisplay:noneなどで非表示の場合は0になる
// (レイアウト計算がされないため)。画面外にあるだけ(display:noneではない)の
// 要素はサイズを持つが、YouTubeのホバープレビューは小さいサイズで描画されるため、
// 面積比較(video-selection.ts側のロジック)で自然に除外される想定。
function toVideoElementInfo(video: HTMLVideoElement): VideoElementInfo {
  return {
    isVisible: video.offsetWidth > 0 && video.offsetHeight > 0,
    width: video.offsetWidth,
    height: video.offsetHeight,
  };
}

/**
 * ページ内の全video要素から、制御すべきメインのvideo要素を1つ探して返す。
 *
 * 呼び出されるたびにDOMを再クエリする(結果をキャッシュしない)設計にしている。
 * これによりYouTubeのSPA遷移(動画→別の動画)でvideo要素が再生成されても、
 * 次にこの関数が呼ばれた時には常に最新のDOMから選び直すため、MutationObserverや
 * yt-navigate-finishイベントを使った再取得の仕組みを別途用意する必要がない
 * (docs/DECISIONS.md E-5の決定事項)。
 *
 * @param doc テスト容易性のため差し替え可能にしているが、実際には常にdocumentを渡す想定。
 * @returns 見つからなければnull(video要素が無いページ、または全て非表示の場合)。
 */
export function findPrimaryVideo(
  doc: Document = document,
): HTMLVideoElement | null {
  const videos = Array.from(doc.querySelectorAll("video"));
  const infos = videos.map(toVideoElementInfo);
  const index = selectPrimaryVideoIndex(infos);
  return index === null ? null : videos[index];
}
