// Phase 1 PoCページのエントリーポイント。
// 現時点ではビルド環境の動作確認用の最小コードのみを置いている。
// カメラ映像取得・MediaPipeによる顔向き検出は Step D で実装する。

const statusEl = document.querySelector<HTMLParagraphElement>("#status");
if (statusEl) {
  statusEl.textContent = "プロジェクト雛形のセットアップ完了。";
}
