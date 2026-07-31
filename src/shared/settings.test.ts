import { describe, expect, it } from "vitest";
import { clampSettingNumber } from "./settings";

describe("clampSettingNumber", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(clampSettingNumber(20, 5, 45, 20)).toBe(20);
  });

  it("min未満の値はminに切り上げる", () => {
    expect(clampSettingNumber(0, 5, 45, 20)).toBe(5);
  });

  it("maxを超える値はmaxに切り下げる", () => {
    expect(clampSettingNumber(100, 5, 45, 20)).toBe(45);
  });

  it("ちょうどmin/maxの値はそのまま返す(境界値)", () => {
    expect(clampSettingNumber(5, 5, 45, 20)).toBe(5);
    expect(clampSettingNumber(45, 5, 45, 20)).toBe(45);
  });

  it("小数はMath.round()で整数に丸める(フレーム数・角度は整数値のため)", () => {
    expect(clampSettingNumber(15.5, 1, 100, 15)).toBe(16);
    expect(clampSettingNumber(15.4, 1, 100, 15)).toBe(15);
  });

  it("NaN(空欄の入力欄等)はfallbackを返す", () => {
    expect(clampSettingNumber(Number.NaN, 5, 45, 20)).toBe(20);
  });

  it("Infinityはfallbackを返す", () => {
    expect(clampSettingNumber(Number.POSITIVE_INFINITY, 5, 45, 20)).toBe(20);
    expect(clampSettingNumber(Number.NEGATIVE_INFINITY, 5, 45, 20)).toBe(20);
  });
});
