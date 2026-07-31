import { describe, expect, it } from "vitest";
import { identifySite, isCameraTargetUrl } from "./site-detection";

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

describe("isCameraTargetUrl", () => {
  it("YouTube/Prime VideoのURLはtrue", () => {
    expect(isCameraTargetUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isCameraTargetUrl("https://www.primevideo.com/detail/xyz")).toBe(
      true,
    );
    expect(isCameraTargetUrl("https://www.amazon.co.jp/gp/video/detail")).toBe(
      true,
    );
  });

  it("対象外サイトのURLはfalse", () => {
    expect(isCameraTargetUrl("https://example.com/")).toBe(false);
  });

  it("urlがundefined(新規タブ等でURLが読めない場合)はfalse", () => {
    expect(isCameraTargetUrl(undefined)).toBe(false);
  });

  it("パース不能な文字列はfalse", () => {
    expect(isCameraTargetUrl("not a url")).toBe(false);
  });

  it("chrome://等、対象サイトと無関係なスキームのURLはfalse", () => {
    expect(isCameraTargetUrl("chrome://extensions")).toBe(false);
  });
});
