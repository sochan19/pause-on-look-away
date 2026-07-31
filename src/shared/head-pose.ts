// このファイルの役割:
// MediaPipe Face Landmarkerが返す「顔の回転行列」から、Yaw(左右の首振り角度)・
// Pitch(上下の傾き)・Roll(首をかしげる角度)を度数(degree)で計算する。
// chrome拡張機能のAPIやDOM、MediaPipeの型には一切依存しない「純粋関数」として実装する
// (アーキテクチャ絶対ルール1)。これにより、実際のカメラやMediaPipeが無い環境でも
// Vitestで単体テストできる。

// MediaPipeのFaceLandmarkerは `outputFacialTransformationMatrixes: true` を指定すると、
// 検出した顔ごとに「4x4の回転+移動行列」を返す。これは長さ16の配列で、
// Three.js/WebGLなどでおなじみの「列優先(column-major)」レイアウトになっている
// (配列の並びが [列0の4要素, 列1の4要素, 列2の4要素, 列3の4要素] という順序)。
export type ColumnMajorMatrix4x4 = readonly number[] | Float32Array;

// 顔の回転を表す3つの角度(度数)。
// - yawDeg: 左右の首振り(正面=0度。左右に振るとプラス/マイナスに変化)
// - pitchDeg: 上下のうなずき
// - rollDeg: 首をかしげる動き
export interface HeadRotationDegrees {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

// pitch(上下の傾き)が±90度に近づくと、yawとrollの区別がつかなくなる
// 「ジンバルロック」という現象が起きる。この閾値を超えたら特別な計算式に切り替える。
// (この定数・分岐はThree.jsのEuler.setFromRotationMatrix('YXZ')と同じ考え方に基づく)
const GIMBAL_LOCK_THRESHOLD = 0.9999999;

function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

// -1〜1の範囲に収める。行列の数値誤差でわずかに1を超えることがあり、
// そのままMath.asin()に渡すとNaNになってしまうための保険。
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 4x4の回転行列(列優先, 長さ16)からYaw/Pitch/Rollを度数で算出する。
 *
 * 分解の順序は「YXZ」(Yaw→Pitch→Rollの順で回転を合成したものとみなす)を採用する。
 * 頭の動きは「まず左右に首を振り(Yaw)→次に上下にうなずき(Pitch)→最後に首をかしげる(Roll)」
 * という順で捉えるのが直感的なため、この順序が頭の姿勢推定でよく使われる。
 *
 * 参考実装: Three.jsの `Euler.setFromRotationMatrix(matrix, 'YXZ')` と同じ計算式。
 */
export function computeHeadRotationDegrees(
  matrix: ColumnMajorMatrix4x4,
): HeadRotationDegrees {
  if (matrix.length !== 16) {
    throw new Error(
      `回転行列は長さ16の配列(4x4)である必要があります(実際の長さ: ${matrix.length})`,
    );
  }

  // 列優先レイアウトでの各要素の位置(添字、0始まり)。
  // m[9]  = 2行目3列目(row=1, col=2)= pitchの計算に使う
  // m[8], m[10] = yawの計算に使う
  // m[1], m[5]  = rollの計算に使う
  // m[2], m[0]  = ジンバルロック時のyaw計算に使う
  const pitchRad = Math.asin(-clamp(matrix[9], -1, 1));

  let yawRad: number;
  let rollRad: number;
  if (Math.abs(matrix[9]) < GIMBAL_LOCK_THRESHOLD) {
    yawRad = Math.atan2(matrix[8], matrix[10]);
    rollRad = Math.atan2(matrix[1], matrix[5]);
  } else {
    // ジンバルロック状態(顔がほぼ真上/真下を向いている)。
    // yawとrollを個別に求められないため、rollは0とみなしyawだけ別式で近似する。
    yawRad = Math.atan2(-matrix[2], matrix[0]);
    rollRad = 0;
  }

  return {
    yawDeg: radToDeg(yawRad),
    pitchDeg: radToDeg(pitchRad),
    rollDeg: radToDeg(rollRad),
  };
}

/**
 * Yaw角度(度数)としきい値から、「カメラの方(=正面)を向いているか」を判定する簡易関数。
 *
 * 注意: これは単発フレームでの判定のみ。まばたきや一瞬の首振りによる誤検知を防ぐための
 * 「Nフレーム継続判定(ヒステリシス)」はPhase 2で別の状態機械として実装する(F-03対応)。
 * Phase 1のPoCでは、まず「1フレームだけを見て正しく角度から向きを判定できるか」を確認する。
 */
export function isFacingCamera(yawDeg: number, thresholdDeg: number): boolean {
  return Math.abs(yawDeg) <= thresholdDeg;
}
