// プロジェクト雛形(Vite + TypeScript + Vitest)が正しく動作しているかを確認するための
// 最小テスト。src/shared/ に実際の判定ロジックが実装され次第、このファイルは削除してよい。
import { describe, expect, it } from "vitest";

describe("プロジェクト雛形", () => {
  it("Vitestが実行できる", () => {
    expect(1 + 1).toBe(2);
  });
});
