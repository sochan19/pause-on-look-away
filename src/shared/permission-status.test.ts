import { describe, expect, it } from "vitest";
import { describeCameraPermissionState } from "./permission-status";

describe("describeCameraPermissionState", () => {
  it("grantedは許可済みメッセージ(promptGuidanceは使われない)", () => {
    expect(
      describeCameraPermissionState("granted", "ボタンを押してください"),
    ).toBe("カメラ: 許可済み");
  });

  it("deniedは拒否メッセージ(promptGuidanceは使われない)", () => {
    expect(
      describeCameraPermissionState("denied", "ボタンを押してください"),
    ).toBe(
      "カメラ: 拒否されています。ブラウザのサイト設定から許可してください。",
    );
  });

  it("promptはpromptGuidanceを埋め込んだ未許可メッセージ", () => {
    expect(
      describeCameraPermissionState("prompt", "ボタンを押してください"),
    ).toBe("カメラ: 未許可です。ボタンを押してください");
  });
});
