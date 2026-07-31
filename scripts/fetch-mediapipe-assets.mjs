// このスクリプトは「MediaPipeの実行に必要な資材(wasmファイルと顔検出モデル)を
// ローカルに揃える」ためのセットアップ用スクリプト。
//
// なぜこれが必要か:
// MV3(Chrome拡張機能の最新仕様)では「リモートコードの実行禁止」というルールがあり、
// 拡張機能はネットワーク越しにJS/wasmを取得して実行してはいけない。そのため、
// MediaPipeのwasm本体と顔検出モデル(.task)は、実行時にCDNから取得するのではなく
// あらかじめリポジトリの実行環境にファイルとして置いておく必要がある。
//
// - wasm本体: npmパッケージ @mediapipe/tasks-vision に同梱されているので、
//   node_modules からコピーするだけでよい。
// - 顔検出モデル(face_landmarker.task): npmパッケージには含まれておらず、
//   Google公式の配布元から別途ダウンロードする必要がある。
//
// public/mediapipe/ 以下はサイズが大きく(合計30MB超)、かつ node_modules 由来の
// 生成物なのでgit管理はしない(.gitignore対象)。このスクリプトを実行すれば
// 誰でも同じ内容を再現できる。npm install 時に自動実行される(package.jsonのpostinstall)。

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const wasmSourceDir = path.join(
  projectRoot,
  "node_modules/@mediapipe/tasks-vision/wasm",
);
const wasmDestDir = path.join(projectRoot, "public/mediapipe/wasm");

// SIMD対応版(vision_wasm_internal.*)のみをコピーする。
// nosimd版・module_internal版はSIMD非対応の古い環境向けの代替ファイルで、
// このPoCではモダンなChromeのみを対象とするため不要。
const wasmFiles = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const modelDestDir = path.join(projectRoot, "public/mediapipe/models");
const modelDestPath = path.join(modelDestDir, "face_landmarker.task");

async function copyWasmFiles() {
  await mkdir(wasmDestDir, { recursive: true });

  for (const fileName of wasmFiles) {
    const destPath = path.join(wasmDestDir, fileName);
    if (existsSync(destPath)) {
      console.log(`[assets] スキップ(既に存在): wasm/${fileName}`);
      continue;
    }

    const sourcePath = path.join(wasmSourceDir, fileName);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `wasmファイルが見つかりません: ${sourcePath}\n` +
          "先に `npm install` で @mediapipe/tasks-vision を導入してください。",
      );
    }

    await copyFile(sourcePath, destPath);
    console.log(`[assets] コピー完了: wasm/${fileName}`);
  }
}

async function downloadModel() {
  await mkdir(modelDestDir, { recursive: true });

  if (existsSync(modelDestPath)) {
    console.log("[assets] スキップ(既に存在): models/face_landmarker.task");
    return;
  }

  console.log("[assets] ダウンロード中: face_landmarker.task (約3.7MB)...");
  const response = await fetch(modelUrl);
  if (!response.ok || !response.body) {
    throw new Error(
      `モデルのダウンロードに失敗しました: HTTP ${response.status}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(modelDestPath, Buffer.from(arrayBuffer));
  console.log("[assets] ダウンロード完了: models/face_landmarker.task");
}

try {
  await copyWasmFiles();
  await downloadModel();
} catch (error) {
  // このスクリプトは npm install の postinstall から呼ばれる。
  // ここで失敗してもnpm installそのものは失敗させたくない(オフライン環境等でも
  // 依存パッケージの導入自体は完了できるようにするため)ので、エラー内容を
  // 表示するだけに留め、プロセスは異常終了させない。
  console.warn("[assets] 資材の取得中にエラーが発生しました:");
  console.warn(error);
  console.warn(
    "[assets] `npm run assets:fetch` で再実行できます。顔向き検出PoCページの動作にはこの資材が必要です。",
  );
}
