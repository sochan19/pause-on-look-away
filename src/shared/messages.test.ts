import { describe, expect, it } from "vitest";
import { isSetPlaybackMessage, isSetPlaybackResponse } from "./messages";

describe("isSetPlaybackMessage", () => {
  it("正しい形のSET_PLAYBACKメッセージはtrue", () => {
    expect(
      isSetPlaybackMessage({ type: "SET_PLAYBACK", command: "pause" }),
    ).toBe(true);
    expect(
      isSetPlaybackMessage({ type: "SET_PLAYBACK", command: "resume" }),
    ).toBe(true);
  });

  it("typeが違うメッセージはfalse", () => {
    expect(isSetPlaybackMessage({ type: "OTHER", command: "pause" })).toBe(
      false,
    );
  });

  it("commandが不正な値ならfalse", () => {
    expect(
      isSetPlaybackMessage({ type: "SET_PLAYBACK", command: "stop" }),
    ).toBe(false);
  });

  it("commandが欠けていればfalse", () => {
    expect(isSetPlaybackMessage({ type: "SET_PLAYBACK" })).toBe(false);
  });

  it("オブジェクト以外(null/文字列/数値等)はすべてfalse", () => {
    expect(isSetPlaybackMessage(null)).toBe(false);
    expect(isSetPlaybackMessage(undefined)).toBe(false);
    expect(isSetPlaybackMessage("SET_PLAYBACK")).toBe(false);
    expect(isSetPlaybackMessage(123)).toBe(false);
  });
});

describe("isSetPlaybackResponse", () => {
  it("{ ok: true }はtrue", () => {
    expect(isSetPlaybackResponse({ ok: true })).toBe(true);
  });

  it("正しいreasonを持つ{ ok: false }はtrue", () => {
    expect(isSetPlaybackResponse({ ok: false, reason: "no-video-found" })).toBe(
      true,
    );
    expect(
      isSetPlaybackResponse({ ok: false, reason: "unsupported-site" }),
    ).toBe(true);
  });

  it("okがfalseなのにreasonが不正な値ならfalse", () => {
    expect(isSetPlaybackResponse({ ok: false, reason: "something-else" })).toBe(
      false,
    );
  });

  it("okがfalseなのにreasonが欠けていればfalse", () => {
    expect(isSetPlaybackResponse({ ok: false })).toBe(false);
  });

  it("オブジェクト以外(null/文字列/数値等)はすべてfalse", () => {
    expect(isSetPlaybackResponse(null)).toBe(false);
    expect(isSetPlaybackResponse(undefined)).toBe(false);
    expect(isSetPlaybackResponse("ok")).toBe(false);
    expect(isSetPlaybackResponse(123)).toBe(false);
  });
});
