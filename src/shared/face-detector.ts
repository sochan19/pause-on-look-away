// このファイルの役割:
// MediaPipe Face Landmarkerの「生成」と「1フレーム分の検出→顔の回転角度への変換」を
// まとめる。PoCページ(src/main.ts)とPhase5のoffscreen document(src/offscreen/offscreen.ts)
// の両方から使うため、コピーではなくここに共通化する。
//
// head-pose.tsやviewing-state.tsと違い、MediaPipeのFaceLandmarkerクラスやvideo要素に
// 直接依存しているため「純粋関数」ではない(chrome API/DOM非依存というアーキテクチャ
// 絶対ルール1は満たせない)。とはいえchrome拡張機能のAPIには依存しないので、
// 「カメラ・DOM・MediaPipeを扱う共通ロジック」として引き続きsrc/shared/に置く。

import type {
  FaceLandmarker,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { FaceLandmarker as FaceLandmarkerClass } from "@mediapipe/tasks-vision";
import {
  computeHeadRotationDegrees,
  type HeadRotationDegrees,
} from "./head-pose";

/**
 * FaceLandmarkerを生成する。
 *
 * MV3はリモートコードの実行を禁止しているため、wasm本体・顔検出モデルはCDNから
 * 取得せず、scripts/fetch-mediapipe-assets.mjs でローカルに用意したファイル
 * (public/mediapipe/ 以下)を指す絶対パスを渡す。この関数がパス指定・GPU delegate設定
 * の唯一の場所になることで、main.tsとoffscreen.tsで同じ設定が重複しないようにする。
 */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  return FaceLandmarkerClass.createFromOptions(
    {
      wasmLoaderPath: "/mediapipe/wasm/vision_wasm_internal.js",
      wasmBinaryPath: "/mediapipe/wasm/vision_wasm_internal.wasm",
    },
    {
      baseOptions: {
        modelAssetPath: "/mediapipe/models/face_landmarker.task",
        // GPU側で推論させることでCPU負荷を抑える(N-01: 動画再生を阻害しない負荷に
        // 抑える要件に対応)。GPUが使えない環境ではここで失敗する可能性があり、
        // 呼び出し側でエラーハンドリングする必要がある(要実機確認: docs/manual-test.md)。
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      // これをtrueにすると、検出結果に顔の回転行列(facialTransformationMatrixes)が
      // 含まれるようになる。head-pose.tsのcomputeHeadRotationDegrees()はこの行列を入力とする。
      outputFacialTransformationMatrixes: true,
    },
  );
}

// faceLandmarker.detectForVideo()自体はこの関数でラップしない。
// 呼び出し側(main.tsはランドマーク描画、offscreen.tsは判定のみ)によって
// 検出結果(FaceLandmarkerResult)の使い道が異なる一方、MediaPipeのVIDEOモードは
// 「1回の検出につき1回だけdetectForVideo()を呼ぶ」制約がある(タイムスタンプが
// 単調増加している必要があるため、同じフレームに2回呼ぶとエラーになる)。
// そのためdetectForVideo()の呼び出しは各呼び出し側に任せ、この関数は
// 「検出結果から回転角度を取り出す」部分だけを共通化する。

/**
 * FaceLandmarkerの検出結果から、顔の回転角度を取り出す。
 * 顔が検出できなかった場合はnullを返す(呼び出し側でviewing-state.tsの
 * deriveCandidateState()に渡し、「顔検出できない=away」として扱う想定)。
 */
export function extractHeadRotation(
  result: FaceLandmarkerResult,
): HeadRotationDegrees | null {
  const rotationMatrix = result.facialTransformationMatrixes[0]?.data;
  return rotationMatrix ? computeHeadRotationDegrees(rotationMatrix) : null;
}
