import { describe, expect, it } from "vitest";
import { decidePlaybackCommand } from "./playback-policy";

describe("decidePlaybackCommand", () => {
  it("非視聴(away)確定なら自動再開設定に関わらずpauseを返す", () => {
    expect(decidePlaybackCommand("away", true)).toBe("pause");
    expect(decidePlaybackCommand("away", false)).toBe("pause");
  });

  it("視聴(looking)復帰かつ自動再開ONならresumeを返す", () => {
    expect(decidePlaybackCommand("looking", true)).toBe("resume");
  });

  it("視聴(looking)復帰でも自動再開OFFならnull(何もしない)を返す", () => {
    expect(decidePlaybackCommand("looking", false)).toBeNull();
  });
});
