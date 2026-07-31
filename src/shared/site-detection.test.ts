import { describe, expect, it } from "vitest";
import { identifySite } from "./site-detection";

describe("identifySite", () => {
  it("youtube.comのドメイン・サブドメインをyoutubeと判定する", () => {
    expect(identifySite("youtube.com")).toBe("youtube");
    expect(identifySite("www.youtube.com")).toBe("youtube");
    expect(identifySite("m.youtube.com")).toBe("youtube");
  });

  it("primevideo.com / amazon.co.jp系をprimevideoと判定する", () => {
    expect(identifySite("www.primevideo.com")).toBe("primevideo");
    expect(identifySite("primevideo.com")).toBe("primevideo");
    expect(identifySite("www.amazon.co.jp")).toBe("primevideo");
  });

  it("対象外のドメインはunknownと判定する", () => {
    expect(identifySite("example.com")).toBe("unknown");
  });

  it("対象ドメインに似た無関係なドメインは誤検知しない", () => {
    expect(identifySite("notyoutube.com")).toBe("unknown");
    expect(identifySite("evil-amazon.co.jp.example.com")).toBe("unknown");
  });
});
