import { describe, expect, it } from "vitest";
import {
  decidePlaybackCommand,
  nextPausedByExtension,
} from "./playback-policy";

describe("decidePlaybackCommand", () => {
  it("非視聴(away)確定なら自動再開設定・pausedByExtensionに関わらずpauseを返す", () => {
    expect(decidePlaybackCommand("away", true, true)).toBe("pause");
    expect(decidePlaybackCommand("away", true, false)).toBe("pause");
    expect(decidePlaybackCommand("away", false, true)).toBe("pause");
    expect(decidePlaybackCommand("away", false, false)).toBe("pause");
  });

  it("視聴(looking)復帰・自動再開ON・拡張機能が一時停止させた動画ならresumeを返す", () => {
    expect(decidePlaybackCommand("looking", true, true)).toBe("resume");
  });

  it("視聴(looking)復帰でも自動再開OFFならnull(何もしない)を返す", () => {
    expect(decidePlaybackCommand("looking", false, true)).toBeNull();
    expect(decidePlaybackCommand("looking", false, false)).toBeNull();
  });

  it("視聴(looking)復帰・自動再開ONでも、拡張機能が一時停止させた動画でなければnullを返す(ユーザーが手動で一時停止した動画を勝手に再生しない)", () => {
    expect(decidePlaybackCommand("looking", true, false)).toBeNull();
  });
});

describe("nextPausedByExtension", () => {
  it("pauseが成功し、実行前は再生中だった(alreadyInState=false)場合はtrue", () => {
    expect(nextPausedByExtension("pause", false)).toBe(true);
  });

  it("pauseが成功したが、実行前から既に一時停止していた(alreadyInState=true)場合はfalse(ユーザーの手動一時停止等、拡張機能が変化させたと確証が持てないため)", () => {
    expect(nextPausedByExtension("pause", true)).toBe(false);
  });

  it("resumeが成功した場合はalreadyInStateの値に関わらずfalse", () => {
    expect(nextPausedByExtension("resume", false)).toBe(false);
    expect(nextPausedByExtension("resume", true)).toBe(false);
  });
});
