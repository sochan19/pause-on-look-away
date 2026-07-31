import { describe, expect, it } from "vitest";
import {
  selectPrimaryVideoIndex,
  type VideoElementInfo,
} from "./video-selection";

function info(
  isVisible: boolean,
  width: number,
  height: number,
): VideoElementInfo {
  return { isVisible, width, height };
}

describe("selectPrimaryVideoIndex", () => {
  it("候補が空ならnullを返す", () => {
    expect(selectPrimaryVideoIndex([])).toBeNull();
  });

  it("すべて非表示ならnullを返す", () => {
    const candidates = [info(false, 1920, 1080), info(false, 640, 360)];
    expect(selectPrimaryVideoIndex(candidates)).toBeNull();
  });

  it("可視な候補が1つだけならそのindexを返す", () => {
    const candidates = [info(false, 1920, 1080), info(true, 200, 100)];
    expect(selectPrimaryVideoIndex(candidates)).toBe(1);
  });

  it("複数の可視候補から最大面積のindexを選ぶ", () => {
    const candidates = [
      info(true, 200, 100), // 面積20,000(ホバープレビュー想定)
      info(true, 1920, 1080), // 面積2,073,600(メインプレイヤー想定)
      info(true, 300, 150), // 面積45,000
    ];
    expect(selectPrimaryVideoIndex(candidates)).toBe(1);
  });

  it("非表示の候補は面積がより大きくても除外する", () => {
    const candidates = [
      info(false, 3840, 2160), // 非表示だが面積は最大
      info(true, 640, 360), // 可視な中では最大
    ];
    expect(selectPrimaryVideoIndex(candidates)).toBe(1);
  });

  it("面積が同点の場合はDOM順で先に現れた方(indexが小さい方)を選ぶ", () => {
    const candidates = [info(true, 640, 360), info(true, 360, 640)];
    expect(selectPrimaryVideoIndex(candidates)).toBe(0);
  });
});
