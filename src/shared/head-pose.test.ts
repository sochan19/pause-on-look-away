import { describe, expect, it } from "vitest";
import { computeHeadRotationDegrees, isFacingCamera } from "./head-pose";

// テスト用ヘルパー: 「Yaw→Pitch→Rollの順で回転を合成した行列」を自前で組み立てる。
// head-pose.ts の computeHeadRotationDegrees() が採用している「YXZ」分解と
// 数学的に対になる合成式(M = Ry(yaw) * Rx(pitch) * Rz(roll))を使う。
// これにより、「既知の角度 → 行列を作る → 関数に渡す → 同じ角度が復元されるか」
// という往復テストができる(実際のMediaPipeが無くても検証可能な理由)。
function buildRotationMatrixYXZ(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
): number[] {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;

  const a = Math.cos(pitch);
  const b = Math.sin(pitch);
  const c = Math.cos(yaw);
  const d = Math.sin(yaw);
  const e = Math.cos(roll);
  const f = Math.sin(roll);

  // 行優先(数学的な表記)での回転行列の各要素。
  const m00 = c * e + d * b * f;
  const m01 = -c * f + d * b * e;
  const m02 = d * a;
  const m10 = a * f;
  const m11 = a * e;
  const m12 = -b;
  const m20 = -d * e + c * b * f;
  const m21 = d * f + c * b * e;
  const m22 = c * a;

  // head-pose.ts が期待する「列優先(column-major)」の長さ16配列に変換する。
  // 平行移動成分(12〜14)は0、右下(15)は1とする(回転計算には影響しない)。
  // biome-ignore format: 行列の見た目を保つため整形しない
  return [
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    0,   0,   0,   1,
  ];
}

describe("computeHeadRotationDegrees", () => {
  it("正面(回転なし)を渡すと全て0度になる", () => {
    const matrix = buildRotationMatrixYXZ(0, 0, 0);
    const result = computeHeadRotationDegrees(matrix);
    expect(result.yawDeg).toBeCloseTo(0, 5);
    expect(result.pitchDeg).toBeCloseTo(0, 5);
    expect(result.rollDeg).toBeCloseTo(0, 5);
  });

  it("Yawのみ回転させた行列からYaw角度を復元できる", () => {
    const matrix = buildRotationMatrixYXZ(30, 0, 0);
    const result = computeHeadRotationDegrees(matrix);
    expect(result.yawDeg).toBeCloseTo(30, 5);
    expect(result.pitchDeg).toBeCloseTo(0, 5);
    expect(result.rollDeg).toBeCloseTo(0, 5);
  });

  it("Yawが負の場合も正しく復元できる(右向き/左向きの符号確認)", () => {
    const matrix = buildRotationMatrixYXZ(-45, 0, 0);
    const result = computeHeadRotationDegrees(matrix);
    expect(result.yawDeg).toBeCloseTo(-45, 5);
  });

  it("Yaw/Pitch/Rollが同時にある場合も往復で復元できる", () => {
    const matrix = buildRotationMatrixYXZ(20, 10, 5);
    const result = computeHeadRotationDegrees(matrix);
    expect(result.yawDeg).toBeCloseTo(20, 5);
    expect(result.pitchDeg).toBeCloseTo(10, 5);
    expect(result.rollDeg).toBeCloseTo(5, 5);
  });

  it("ジンバルロック(Pitchが90度付近)ではPitch=90度・Roll=0度になり、YawはYaw-Rollの近似値になる", () => {
    // Pitchが±90度に近づくと、数学的にYawとRollの回転が同じ軸(見た目上)に重なってしまい、
    // 元の2つの角度を個別には復元できない(ジンバルロック)。実装ではRoll=0とみなし、
    // Yawには「Yaw-Roll」に相当する値を計算式(atan2(-m[2], m[0]))で近似している。
    // 20度 - 15度 = 5度 が理論値。
    const matrix = buildRotationMatrixYXZ(20, 90, 15);
    const result = computeHeadRotationDegrees(matrix);
    expect(result.pitchDeg).toBeCloseTo(90, 3);
    expect(result.rollDeg).toBe(0);
    expect(result.yawDeg).toBeCloseTo(5, 2);
  });

  it("Pitchのみ回転させた行列からPitch角度を復元できる(正負とも)", () => {
    const positive = computeHeadRotationDegrees(
      buildRotationMatrixYXZ(0, 25, 0),
    );
    expect(positive.pitchDeg).toBeCloseTo(25, 5);

    const negative = computeHeadRotationDegrees(
      buildRotationMatrixYXZ(0, -25, 0),
    );
    expect(negative.pitchDeg).toBeCloseTo(-25, 5);
  });

  it("Rollのみ回転させた行列からRoll角度を復元できる(正負とも)", () => {
    const positive = computeHeadRotationDegrees(
      buildRotationMatrixYXZ(0, 0, 12),
    );
    expect(positive.rollDeg).toBeCloseTo(12, 5);

    const negative = computeHeadRotationDegrees(
      buildRotationMatrixYXZ(0, 0, -12),
    );
    expect(negative.rollDeg).toBeCloseTo(-12, 5);
  });

  it("Float32Array(MediaPipeの実際の戻り値の型)を渡しても計算できる", () => {
    const matrix = new Float32Array(buildRotationMatrixYXZ(30, 10, 5));
    const result = computeHeadRotationDegrees(matrix);
    expect(result.yawDeg).toBeCloseTo(30, 1);
    expect(result.pitchDeg).toBeCloseTo(10, 1);
    expect(result.rollDeg).toBeCloseTo(5, 1);
  });

  it("長さ16でない配列を渡すとエラーになる", () => {
    expect(() => computeHeadRotationDegrees([1, 2, 3])).toThrow();
  });
});

describe("isFacingCamera", () => {
  it("Yawが0度ならしきい値に関わらず正面を向いている", () => {
    expect(isFacingCamera(0, 15)).toBe(true);
  });

  it("Yawがしきい値ちょうどなら正面とみなす(境界値)", () => {
    expect(isFacingCamera(15, 15)).toBe(true);
    expect(isFacingCamera(-15, 15)).toBe(true);
  });

  it("Yawがしきい値を超えると正面とはみなさない", () => {
    expect(isFacingCamera(15.1, 15)).toBe(false);
    expect(isFacingCamera(-15.1, 15)).toBe(false);
  });
});
