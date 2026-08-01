// このファイルの役割:
// YouTube / Prime Video に自動注入されるcontent scriptのエントリポイント。
// Phase 4からは、backgroundから送られてくるpause/resume指示(SET_PLAYBACK)を
// 受け取り、実際のvideo要素に対して.pause()/.play()を実行する(F-10, F-12対応)。
// Phase 6からは、Prime Video(DRM/EME環境)に対してもYouTubeと同じ経路で
// pause()/play()を実行する(F-13対応)。サイトによる制御対象の分岐は行わない
// (manifest.jsonのcontent_scripts.matchesがYouTube/Prime Videoの2サイトのみに
// 注入を絞っているため、ここではそれ以外のサイトを考慮する必要がない)。

import { onMessage } from "../shared/chrome/runtime";
import { LOG_PREFIX } from "../shared/constants";
import {
  isSetPlaybackMessage,
  type SetPlaybackResponse,
} from "../shared/messages";
import { identifySite } from "../shared/site-detection";
import { findPrimaryVideo } from "./video-control";

const site = identifySite(location.hostname);

console.log(
  `${LOG_PREFIX} content script loaded on ${location.hostname} (site=${site})`,
);

onMessage((message, _sender, sendResponse) => {
  // 自分宛て(SET_PLAYBACK)以外のメッセージは無視する。型ガードでない場合は
  // 何もハンドリングしないので、戻り値もfalse(=このリスナーは応答しない)でよい。
  if (!isSetPlaybackMessage(message)) {
    return false;
  }

  // querySelector('video')を直接使わず、必ずこのユーティリティ経由で
  // 「制御すべき1つのvideo要素」を特定する(アーキテクチャ絶対ルール5)。
  // メッセージを受け取るたびに毎回DOMを再クエリするため、YouTubeのSPA遷移で
  // video要素が作り直されても常に最新の要素を見つけられる(E-5決定事項)。
  const video = findPrimaryVideo();
  if (video === null) {
    const response: SetPlaybackResponse = {
      ok: false,
      reason: "no-video-found",
    };
    sendResponse(response);
    return false;
  }

  // 実行前の状態を覚えておく。「そのpause/resumeが実際に状態を変えたか」を
  // background側へ伝えるため(messages.tsのSetPlaybackResponseのコメント参照。
  // ユーザーが手動で一時停止した動画を、視線が戻っただけで勝手に再生してしまう
  // バグを防ぐために必要な情報)。
  const alreadyInState =
    message.command === "pause" ? video.paused : !video.paused;

  if (message.command === "pause") {
    video.pause();
  } else {
    // F-11(自動再開ON/OFF)の判断はbackground側(decidePlaybackCommand)で
    // 済んでいるため、content script側はresumeコマンドが来たら常にplay()する。
    video.play();
  }

  const response: SetPlaybackResponse = { ok: true, alreadyInState };
  sendResponse(response);
  return false;
});
