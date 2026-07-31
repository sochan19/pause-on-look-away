// このファイルの役割:
// Phase 1〜2 PoCページの本体。Webカメラの映像を取得し、MediaPipe Face Landmarkerで
// リアルタイムに顔のランドマーク(特徴点)と顔の回転行列を検出する。
// 回転行列からYaw角度を計算する部分は src/shared/head-pose.ts、まばたきや一瞬の首振りで
// 表示がちらつかないようにするNフレーム継続判定(ヒステリシス)は src/shared/viewing-state.ts
// の純粋関数に任せ、このファイルは「カメラ・DOM・MediaPipeのAPIを直接操作する」副作用のある
// 処理だけを担当する(アーキテクチャ絶対ルール1: 判定ロジックは純粋関数、それ以外はここに
// 書く、という役割分担)。

import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  CONFIRMATION_FRAME_COUNT,
  FACING_THRESHOLD_DEG,
} from "./shared/constants";
import { computeHeadRotationDegrees } from "./shared/head-pose";
import {
  createInitialHysteresisState,
  deriveCandidateState,
  updateHysteresisState,
} from "./shared/viewing-state";

// document.querySelector() は「見つからない可能性」を型に含む(戻り値が `T | null`)。
// main()やdetectLoop()など別の関数から参照する際、TypeScriptは関数境界をまたいだ
// null チェックの絞り込みをしてくれない(constでも同様)ため、ここで「無ければ即エラー」
// というヘルパーに通し、以降は非null型の変数として扱えるようにする。
function requireNonNull<T>(value: T | null, errorMessage: string): T {
  if (value === null) {
    // index.html側の要素が見つからない = HTMLの構造が壊れている異常事態なので、
    // ここで早期に気づけるようにエラーを投げる(通常の実行パスでは起こらないはず)。
    throw new Error(errorMessage);
  }
  return value;
}

const videoEl = requireNonNull(
  document.querySelector<HTMLVideoElement>("#camera-preview"),
  "index.htmlに#camera-previewが見つかりません。",
);
const canvasEl = requireNonNull(
  document.querySelector<HTMLCanvasElement>("#landmarks-overlay"),
  "index.htmlに#landmarks-overlayが見つかりません。",
);
const statusEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#status"),
  "index.htmlに#statusが見つかりません。",
);
const angleEl = requireNonNull(
  document.querySelector<HTMLParagraphElement>("#angles"),
  "index.htmlに#anglesが見つかりません。",
);
const canvasCtx = requireNonNull(
  canvasEl.getContext("2d"),
  "Canvasの2Dコンテキストを取得できませんでした。",
);
const drawingUtils = new DrawingUtils(canvasCtx);

// FaceLandmarkerはWASM/GPU側にリソースを確保しているため、作成後は
// この変数で保持しておき、後片付け(cleanup)の際に close() できるようにする。
let activeFaceLandmarker: FaceLandmarker | null = null;

// ヒステリシス状態機械の現在状態。detectLoop()が呼ばれるたびにupdateHysteresisState()の
// 戻り値で置き換えていく(フレームをまたいで継続カウントを覚えておく必要があるため、
// activeFaceLandmarkerと同様にモジュールスコープの変数として保持する)。
let hysteresisState = createInitialHysteresisState();

// カメラ映像とFaceLandmarkerのリソースを後片付けする。
// エラー発生時・ページを閉じる時に必ず呼び、カメラをつけっぱなしにしない
// (プライバシー要件N-02に関わる基本的な配慮)。
// MediaStreamTrack.stop()もFaceLandmarker.close()も、既に停止/破棄済みのものへ
// 再度呼んでもエラーにならない安全な設計なので、複数箇所(初期化失敗時・検出ループの
// 例外時・ページ離脱時)から同じstreamに対して呼ばれても問題ない。
function cleanup(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
  videoEl.srcObject = null;
  activeFaceLandmarker?.close();
  activeFaceLandmarker = null;
}

async function main(): Promise<void> {
  statusEl.textContent = "カメラの許可を待っています...";

  // getUserMedia() はブラウザに「カメラを使わせてください」という許可ダイアログを
  // 表示させる関数。ユーザーが許可すると映像ストリームが返る。
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });

  // ページを離れる時にカメラを止め忘れないようにする。
  window.addEventListener("pagehide", () => cleanup(stream));

  try {
    videoEl.srcObject = stream;
    await videoEl.play();

    // canvasのサイズをカメラ映像の実サイズに合わせる(そうしないとランドマークの
    // 位置がずれて表示されてしまう)。
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;

    statusEl.textContent = "顔検出モデルを読み込んでいます...";

    // MV3(Chrome拡張の最新仕様)はリモートコードの実行を禁止しているため、
    // MediaPipeのwasm本体・顔検出モデルはCDNから取得せず、
    // scripts/fetch-mediapipe-assets.mjs でローカルに用意したファイル
    // (public/mediapipe/ 以下。Viteの開発サーバー/ビルドがそのまま静的配信する)を使う。
    const faceLandmarker = await FaceLandmarker.createFromOptions(
      {
        wasmLoaderPath: "/mediapipe/wasm/vision_wasm_internal.js",
        wasmBinaryPath: "/mediapipe/wasm/vision_wasm_internal.wasm",
      },
      {
        baseOptions: {
          modelAssetPath: "/mediapipe/models/face_landmarker.task",
          // GPU側で推論させることでCPU負荷を抑える(N-01: 動画再生を阻害しない負荷に
          // 抑える要件に対応)。GPUが使えない環境ではここで失敗する可能性があり、
          // その場合は下のcatch節でエラー表示される(要実機確認: docs/manual-test.md)。
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        // これをtrueにすると、検出結果に顔の回転行列(facialTransformationMatrixes)が
        // 含まれるようになる。head-pose.tsのcomputeHeadRotationDegrees()はこの行列を入力とする。
        outputFacialTransformationMatrixes: true,
      },
    );
    activeFaceLandmarker = faceLandmarker;

    statusEl.textContent = "検出中...";
    detectLoop(faceLandmarker, stream);
  } catch (error) {
    // 初期化の途中(モデル読み込み等)で失敗した場合、許可済みのカメラをつけっぱなしに
    // しないようここで止めてから、エラーをmain().catch()側に伝える。
    cleanup(stream);
    throw error;
  }
}

// requestAnimationFrameで毎フレーム呼び出され、検出→描画→次フレーム予約を繰り返すループ。
function detectLoop(faceLandmarker: FaceLandmarker, stream: MediaStream): void {
  try {
    const result = faceLandmarker.detectForVideo(videoEl, performance.now());

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const landmarks = result.faceLandmarks[0];
    if (landmarks) {
      // 顔の特徴点同士を線でつないで描画する(目・鼻・輪郭などのメッシュ)。
      // これは動作確認用の見た目であり、判定ロジックには関係ない。
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#00FF0040", lineWidth: 1 },
      );
    }

    const rotationMatrix = result.facialTransformationMatrixes[0]?.data;
    const rotation = rotationMatrix
      ? computeHeadRotationDegrees(rotationMatrix)
      : null;

    // 1フレームごとの候補状態(looking/away)を求める。顔が検出できない場合は
    // deriveCandidateState()内でaway扱いになる(要件F-04)。
    // rotationがnull(顔検出できず)のときyawDegには0を渡すが、この値は
    // hasFace=falseのとき関数内で使われないダミー値であり、意味を持たない。
    const candidate = deriveCandidateState(
      rotation !== null,
      rotation?.yawDeg ?? 0,
      FACING_THRESHOLD_DEG,
    );

    // 候補状態をヒステリシス状態機械に渡し、Nフレーム継続した場合のみ確定状態を切り替える
    // (まばたきや一瞬の首振りで表示がちらつかないようにするため。要件F-03)。
    hysteresisState = updateHysteresisState(
      hysteresisState,
      candidate,
      CONFIRMATION_FRAME_COUNT,
    );
    const facing = hysteresisState.confirmed === "looking";

    if (rotation) {
      const { yawDeg, pitchDeg, rollDeg } = rotation;
      angleEl.textContent =
        `Yaw: ${yawDeg.toFixed(1)}°  Pitch: ${pitchDeg.toFixed(1)}°  Roll: ${rollDeg.toFixed(1)}°  ` +
        `— ${facing ? "視聴中" : "非視聴"}`;
    } else {
      // 「顔が検出できません」なのに「視聴中」と表示されることがあるのは矛盾ではない。
      // ヒステリシスがNフレームに達するまでは直前の確定状態(=facing)を保持し続ける仕様
      // であり、実際に一時停止を判断する状態(confirmed)と表示を一致させるための挙動。
      angleEl.textContent = `顔が検出できません — ${facing ? "視聴中" : "非視聴"}`;
    }

    canvasCtx.restore();

    requestAnimationFrame(() => detectLoop(faceLandmarker, stream));
  } catch (error) {
    // ループの途中で例外が起きると、何もしなければ次のrequestAnimationFrameが
    // 呼ばれずに「検出中...」の表示のまま静かに止まってしまい、フリーズしたように
    // 見えてしまう。ユーザーが気づけるようエラー表示を出し、カメラも止める。
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = `検出ループでエラーが発生しました: ${message}`;
    cleanup(stream);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  statusEl.textContent = `エラーが発生しました: ${message}`;
});
