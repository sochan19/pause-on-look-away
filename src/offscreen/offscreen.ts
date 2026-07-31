// このファイルの役割:
// offscreen document(不可視のページ)の本体。Phase 1 PoCページ(src/main.ts)にあった
// 「カメラ映像取得→MediaPipeで顔向き検出→ヒステリシスで確定状態を求める」という
// 処理を、実際の拡張機能として動かすための場所がここ。
//
// main.tsとの一番大きな違いは「見せるためのページではない」こと。ランドマークの
// 描画や画面上のテキスト表示は行わず、代わりに確定状態(looking/away)が変化したら
// chrome.runtime.sendMessage()でbackground service workerへ通知する。
//
// このoffscreen documentはbackground(service worker)から作成された後、
// ブラウザが起動している間ずっと常駐させる設計にしている(DECISIONS.md E-2)。
// service workerはアイドルで何度も停止・再起動されるが、offscreen documentは
// それとは独立したライフサイクルを持つため、MediaPipeのモデルを一度読み込んだら
// 保持し続けられる(video対象サイトへ切り替えるたびに読み込み直すコストを避ける)。
// その代わり、実際にカメラを使う(getUserMedia)かどうかは、backgroundから届く
// START_CAMERA/STOP_CAMERAメッセージに従って切り替える(activeタブが
// YouTube/Prime Videoの間だけカメラを物理的にONにする省電力設計)。

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { onMessage, sendMessage } from "../shared/chrome/runtime";
import { getSettings, onSettingsChanged } from "../shared/chrome/storage";
import { DETECTION_INTERVAL_MS, LOG_PREFIX } from "../shared/constants";
import { requireNonNull } from "../shared/dom-utils";
import {
  createFaceLandmarker,
  extractHeadRotation,
} from "../shared/face-detector";
import {
  type CameraErrorMessage,
  type ConfirmedStateChangedMessage,
  isOffscreenControlMessage,
} from "../shared/messages";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import {
  createInitialHysteresisState,
  deriveCandidateState,
  updateHysteresisState,
} from "../shared/viewing-state";

const videoEl = requireNonNull(
  document.querySelector<HTMLVideoElement>("#camera-source"),
  "offscreen.htmlに#camera-sourceが見つかりません。",
);

// モジュール読み込み時にすぐFaceLandmarkerの生成を始める(常駐・使い回すため)。
// turnCameraOn()内でこのPromiseを待つことで、「まだモデル読み込み中に
// START_CAMERAが来る」という順序の問題を気にせず書ける。
// letにしているのは、読み込みに失敗した場合に次のturnCameraOn()呼び出しで
// 再試行できるようにするため(constのままだと、一度失敗したPromiseを
// 永久に使い回すことになり、GPU初期化の一時的な失敗等から復帰できなくなる)。
let faceLandmarkerPromise = createFaceLandmarker();

// カメラが起動中かどうかを表す状態。getUserMedia()で取得したMediaStreamを
// 保持しておき、STOP_CAMERA時にトラックを止めるために使う。
// nullの間は「カメラ停止中」を意味する。
let activeStream: MediaStream | null = null;

// setInterval()のID。stopCamera()でclearInterval()するために保持する。
let detectionIntervalId: ReturnType<typeof setInterval> | null = null;

// ヒステリシス状態機械の現在状態。main.tsと同様、フレームをまたいで
// 継続カウントを覚えておく必要があるためモジュールスコープで保持する。
// STOP_CAMERA後の次のSTART_CAMERAでは初期状態からやり直す(新しい視聴セッションとして
// 扱う。視聴対象外のタブに切り替えていた間の状態を持ち越す意味は無いため)。
let hysteresisState = createInitialHysteresisState();

// ユーザー設定(判定角度・ディレイフレーム数、Phase7・F-21)のキャッシュ。
// offscreen documentはE-2決定によりブラウザ起動中ずっと常駐させる設計のため、
// service worker(いつアイドルで終了されるかわからない)と違ってモジュール変数に
// キャッシュを持たせても安全。読み込み時にgetSettings()で初期値を反映し、
// 以後はonSettingsChanged()でoptionsページからの変更を都度反映する。
let currentSettings: Settings = DEFAULT_SETTINGS;
void getSettings().then((settings) => {
  currentSettings = settings;
});
onSettingsChanged((settings) => {
  currentSettings = settings;
});

// 「カメラをON/OFFどちらにしたいか」という目標状態。backgroundからの
// START_CAMERA/STOP_CAMERAメッセージが届くたびにこれを書き換える。
// この変数と、実際の状態(activeStreamがnullかどうか)を一致させる処理が
// 下のreconcileCameraState()。
type DesiredCameraState = "on" | "off";
let desiredCameraState: DesiredCameraState = "off";

// reconcileCameraState()が現在実行中かどうか。getUserMedia()はawaitを挟む
// 非同期処理のため、実行中にもう一度START_CAMERA/STOP_CAMERAが届くことがある
// (例: タブを素早く切り替えた場合)。そのたびに新しいreconcileCameraState()を
// 並行して走らせると、getUserMedia()の二重呼び出しや「古い指示に従って
// カメラをONにしてしまう」といった競合が起きる。そのためreconcileCameraState()
// 自体は常に1つだけ実行し、実行中に来た新しい指示はdesiredCameraStateの書き換え
// だけ行って、実行中のループが最後にそれを拾う設計にする。
let isReconciling = false;

/**
 * backgroundからの指示(START_CAMERA/STOP_CAMERA)を受け取り、目標状態を更新する。
 * 実際にカメラを動かす処理(reconcileCameraState)はここでは待たない
 * (呼び出し側のonMessageハンドラを長時間ブロックしないため)。
 */
function setDesiredCameraState(next: DesiredCameraState): void {
  desiredCameraState = next;
  void reconcileCameraState();
}

/**
 * 実際のカメラの状態を、desiredCameraStateに一致するまで動かし続ける。
 *
 * whileループになっているのは、「ONにしようとしてgetUserMedia()を待っている間に
 * 目標がOFFに変わった」というケースを取りこぼさないため。ループの各周回の最初で
 * 最新のdesiredCameraStateを読み直し、それと現在の実際の状態(activeStreamの有無)
 * を比較する。一致していればループを抜ける。この「読み直し」があるおかげで、
 * 実行中に何度指示が変わっても、最終的には最後に受け取った指示どおりの状態に収束する。
 */
async function reconcileCameraState(): Promise<void> {
  if (isReconciling) {
    // 既に実行中のループがいずれ最新のdesiredCameraStateを見てくれるので、
    // ここでは何もせず戻る(二重にループを走らせない)。
    return;
  }
  isReconciling = true;

  try {
    for (;;) {
      const target = desiredCameraState;
      const isCurrentlyOn = activeStream !== null;

      if (target === "on" && !isCurrentlyOn) {
        await turnCameraOn();
      } else if (target === "off" && isCurrentlyOn) {
        turnCameraOff();
      } else {
        // 目標と実際の状態が既に一致している = やることがない。
        break;
      }
    }
  } finally {
    isReconciling = false;
  }
}

/**
 * カメラを起動し、顔向き検出ループを開始する。reconcileCameraState()からのみ呼ぶ。
 */
async function turnCameraOn(): Promise<void> {
  let faceLandmarker: FaceLandmarker;
  try {
    faceLandmarker = await faceLandmarkerPromise;
  } catch (error) {
    console.error(`${LOG_PREFIX} [offscreen] モデルの読み込みに失敗:`, error);
    await notifyCameraError(error);
    // モデル読み込みが失敗した場合、目標をoffに戻しておく。そうしないと
    // reconcileCameraState()のループが「target === on かつ !isCurrentlyOn」の
    // ままturnCameraOn()を呼び続け、無限ループになってしまう。
    desiredCameraState = "off";
    // 失敗したPromiseを使い回さず、次にturnCameraOn()が呼ばれた時に
    // 新しく読み込みをやり直せるようにする(一時的な失敗からの復帰を可能にするため)。
    faceLandmarkerPromise = createFaceLandmarker();
    return;
  }

  // catch節でも後片付けできるよう、try節の外(同じスコープ)で宣言しておく。
  // getUserMedia()成功後・activeStreamへの代入前に例外が起きた場合でも、
  // この変数経由でトラックを止められるようにするため。
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });

    // ここに来るまでの間(getUserMedia()の許可待ち)に、目標がまた"off"へ
    // 変わっている可能性がある。その場合はこのstreamを使わずすぐ止める
    // (直近の指示を優先する)。
    if (desiredCameraState !== "on") {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    activeStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();

    // カメラが途中で(OS側の無効化・物理的な取り外し等で)強制的に終了した場合、
    // getUserMedia()をやり直さないと復帰できない。トラック終了を検知したら
    // activeStreamをnullに戻し、reconcileCameraState()が再度呼ばれた時に
    // 「実はまだONのはずなのにOFFになっている」ことに気づけるようにする。
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        if (activeStream === stream) {
          console.warn(
            `${LOG_PREFIX} [offscreen] カメラのトラックが終了しました`,
          );
          turnCameraOff();
          void reconcileCameraState();
        }
      });
    }

    hysteresisState = createInitialHysteresisState();

    detectionIntervalId = setInterval(() => {
      runDetectionTick(faceLandmarker);
    }, DETECTION_INTERVAL_MS);

    console.log(`${LOG_PREFIX} [offscreen] カメラ起動・検出ループ開始`);
  } catch (error) {
    // 許可が下りていない(NotAllowedError)場合もここに来る。offscreen documentは
    // 許可ダイアログを自力で出せないため、popup側で先に許可を取ってもらう必要がある
    // (DECISIONS.md E章)。
    // videoEl.play()の失敗等、getUserMedia()自体は成功した後に例外が起きるケースも
    // あるため、streamが取得できていればここでもトラックを止めてカメラをつけっぱなし
    // にしない(N-02: プライバシー配慮)。
    console.error(`${LOG_PREFIX} [offscreen] カメラの起動に失敗:`, error);
    if (stream !== null) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    activeStream = null;
    desiredCameraState = "off";
    await notifyCameraError(error);
  }
}

/**
 * カメラを停止する。reconcileCameraState()からのみ呼ぶ(同期処理でawaitを挟まない
 * ため、呼び出し中に目標が変わる心配がない)。
 * MediaStreamTrack.stop()で物理的にカメラを止める(録画中インジケータも消える)。
 * FaceLandmarkerインスタンス自体は破棄せず、次回turnCameraOn()で再利用する。
 */
function turnCameraOff(): void {
  if (detectionIntervalId !== null) {
    clearInterval(detectionIntervalId);
    detectionIntervalId = null;
  }
  if (activeStream !== null) {
    for (const track of activeStream.getTracks()) {
      track.stop();
    }
    activeStream = null;
  }
  videoEl.srcObject = null;
  console.log(`${LOG_PREFIX} [offscreen] カメラ停止`);
}

/**
 * 検出ループの1tick分。main.tsのdetectLoop()と同じ判定の流れ
 * (検出→候補状態→ヒステリシス)を、setIntervalの1回分として実行する。
 *
 * main.tsのdetectLoop()と同様、detectForVideo()の呼び出し自体がエラーを投げる
 * 可能性がある(カメラが途中で切断された等)。setIntervalのコールバック内で
 * 例外を投げっぱなしにするとコンソールにエラーが出るだけで誰も気づけないため、
 * ここで捕まえてCAMERA_ERRORとしてbackgroundへ通知し、カメラを止める。
 */
function runDetectionTick(faceLandmarker: FaceLandmarker): void {
  try {
    // カメラ映像の最初の数フレームはまだサイズが0のことがあるため、
    // 準備が整うまでは検出をスキップする(意味のない入力でエラーになるのを防ぐ)。
    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      return;
    }

    const result = faceLandmarker.detectForVideo(videoEl, performance.now());
    const rotation = extractHeadRotation(result);

    const candidate = deriveCandidateState(
      rotation !== null,
      rotation?.yawDeg ?? 0,
      currentSettings.facingThresholdDeg,
    );

    const previousConfirmed = hysteresisState.confirmed;
    hysteresisState = updateHysteresisState(
      hysteresisState,
      candidate,
      currentSettings.confirmationFrameCount,
    );

    // 確定状態が実際に変化した時だけbackgroundへ通知する。毎tick送ると
    // backgroundを不必要に起こし続けてしまう(MV3のイベント駆動の趣旨に反する)ため。
    if (hysteresisState.confirmed !== previousConfirmed) {
      const message: ConfirmedStateChangedMessage = {
        type: "CONFIRMED_STATE_CHANGED",
        state: hysteresisState.confirmed,
      };
      void sendMessage(message);
      console.log(
        `${LOG_PREFIX} [offscreen] 確定状態が変化: ${hysteresisState.confirmed}`,
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} [offscreen] 検出ループでエラー:`, error);
    desiredCameraState = "off";
    turnCameraOff();
    void notifyCameraError(error);
  }
}

async function notifyCameraError(error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  const message: CameraErrorMessage = { type: "CAMERA_ERROR", reason };
  await sendMessage(message);
}

onMessage((message, _sender, _sendResponse) => {
  if (!isOffscreenControlMessage(message)) {
    return false;
  }

  setDesiredCameraState(message.type === "START_CAMERA" ? "on" : "off");
  return false;
});

console.log(`${LOG_PREFIX} [offscreen] offscreen document loaded`);
