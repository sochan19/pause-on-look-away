// このファイルの役割:
// カメラのブラウザ許可状態(PermissionState: "granted"/"denied"/"prompt")を、
// ユーザー向けの日本語メッセージに変換する。popup.ts・options.tsの両方で
// ほぼ同じ文言が必要になるため、重複させずここに1つだけ置く
// (「未許可」時の案内文だけは画面ごとに違う操作を促すため引数で受け取る)。
// chrome API/DOMに依存しない純粋関数なのでVitestでテストできる。

export function describeCameraPermissionState(
  state: PermissionState,
  promptGuidance: string,
): string {
  switch (state) {
    case "granted":
      return "カメラ: 許可済み";
    case "denied":
      return "カメラ: 拒否されています。ブラウザのサイト設定から許可してください。";
    default:
      return `カメラ: 未許可です。${promptGuidance}`;
  }
}
