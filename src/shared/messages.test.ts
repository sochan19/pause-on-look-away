import { describe, expect, it } from "vitest";
import {
  isCameraErrorMessage,
  isConfirmedStateChangedMessage,
  isOffscreenControlMessage,
  isSetPlaybackMessage,
  isSetPlaybackResponse,
} from "./messages";

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
  it("alreadyInStateを持つ{ ok: true }はtrue", () => {
    expect(isSetPlaybackResponse({ ok: true, alreadyInState: true })).toBe(
      true,
    );
    expect(isSetPlaybackResponse({ ok: true, alreadyInState: false })).toBe(
      true,
    );
  });

  it("okがtrueなのにalreadyInStateが欠けている/型が違う場合はfalse", () => {
    expect(isSetPlaybackResponse({ ok: true })).toBe(false);
    expect(isSetPlaybackResponse({ ok: true, alreadyInState: "true" })).toBe(
      false,
    );
  });

  it("正しいreasonを持つ{ ok: false }はtrue", () => {
    expect(isSetPlaybackResponse({ ok: false, reason: "no-video-found" })).toBe(
      true,
    );
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

describe("isOffscreenControlMessage", () => {
  it("START_CAMERA/STOP_CAMERAはtrue", () => {
    expect(isOffscreenControlMessage({ type: "START_CAMERA" })).toBe(true);
    expect(isOffscreenControlMessage({ type: "STOP_CAMERA" })).toBe(true);
  });

  it("typeが違う/欠けている場合はfalse", () => {
    expect(isOffscreenControlMessage({ type: "SET_PLAYBACK" })).toBe(false);
    expect(isOffscreenControlMessage({})).toBe(false);
  });

  it("オブジェクト以外はすべてfalse", () => {
    expect(isOffscreenControlMessage(null)).toBe(false);
    expect(isOffscreenControlMessage(undefined)).toBe(false);
    expect(isOffscreenControlMessage("START_CAMERA")).toBe(false);
  });
});

describe("isConfirmedStateChangedMessage", () => {
  it("正しい形(looking/away)はtrue", () => {
    expect(
      isConfirmedStateChangedMessage({
        type: "CONFIRMED_STATE_CHANGED",
        state: "looking",
      }),
    ).toBe(true);
    expect(
      isConfirmedStateChangedMessage({
        type: "CONFIRMED_STATE_CHANGED",
        state: "away",
      }),
    ).toBe(true);
  });

  it("stateが不正な値ならfalse", () => {
    expect(
      isConfirmedStateChangedMessage({
        type: "CONFIRMED_STATE_CHANGED",
        state: "unknown",
      }),
    ).toBe(false);
  });

  it("typeが違う/stateが欠けている場合はfalse", () => {
    expect(
      isConfirmedStateChangedMessage({ type: "OTHER", state: "looking" }),
    ).toBe(false);
    expect(
      isConfirmedStateChangedMessage({ type: "CONFIRMED_STATE_CHANGED" }),
    ).toBe(false);
  });

  it("オブジェクト以外はすべてfalse", () => {
    expect(isConfirmedStateChangedMessage(null)).toBe(false);
    expect(isConfirmedStateChangedMessage(undefined)).toBe(false);
  });
});

describe("isCameraErrorMessage", () => {
  it("正しい形はtrue", () => {
    expect(
      isCameraErrorMessage({ type: "CAMERA_ERROR", reason: "NotAllowedError" }),
    ).toBe(true);
  });

  it("reasonが文字列でない/欠けている場合はfalse", () => {
    expect(isCameraErrorMessage({ type: "CAMERA_ERROR", reason: 123 })).toBe(
      false,
    );
    expect(isCameraErrorMessage({ type: "CAMERA_ERROR" })).toBe(false);
  });

  it("typeが違う場合はfalse", () => {
    expect(isCameraErrorMessage({ type: "OTHER", reason: "x" })).toBe(false);
  });

  it("オブジェクト以外はすべてfalse", () => {
    expect(isCameraErrorMessage(null)).toBe(false);
    expect(isCameraErrorMessage(undefined)).toBe(false);
  });
});
