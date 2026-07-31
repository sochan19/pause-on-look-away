// このファイルの役割:
// YouTube / Prime Video に自動注入されるcontent scriptのエントリポイント。
// Phase 4からは、backgroundから送られてくるpause/resume指示(SET_PLAYBACK)を
// 受け取り、実際のvideo要素に対して.pause()/.play()を実行する(F-10, F-12対応)。
// Prime Video側のDRM検証はPhase 6で行うため、Phase4時点ではYouTube以外は
// 制御の対象外として扱う(F-13は未対応のまま)。

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

  // Prime VideoのDRM環境下での動作検証はPhase 6で行う。それまではYouTube以外の
  // タブでpause/resumeを実行しない(誤ってPrime Video側のプレイヤーを操作しない)。
  if (site !== "youtube") {
    const response: SetPlaybackResponse = {
      ok: false,
      reason: "unsupported-site",
    };
    sendResponse(response);
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

  if (message.command === "pause") {
    video.pause();
  } else {
    // F-11(自動再開ON/OFF)の判断はbackground側(decidePlaybackCommand)で
    // 済んでいるため、content script側はresumeコマンドが来たら常にplay()する。
    video.play();
  }

  const response: SetPlaybackResponse = { ok: true };
  sendResponse(response);
  return false;
});
