import { describe, it, expect, vi, afterEach } from "vitest";
import { iosAppLink, playStoreUrl } from "@/lib/appStores";

describe("playStoreUrl", () => {
  it("links the Play listing with install attribution", () => {
    expect(playStoreUrl("landing")).toBe(
      "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed&referrer=utm_source%3Dsolvymed_web%26utm_medium%3Dweb%26utm_campaign%3Dlanding",
    );
  });
});

describe("iosAppLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is 'coming soon' when unset, empty or not a URL", () => {
    // Explicitly unset, so a locally configured value can't leak in.
    vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", undefined);
    expect(iosAppLink("landing")).toEqual({ mode: "soon" });
    expect(iosAppLink("landing", "")).toEqual({ mode: "soon" });
    expect(iosAppLink("landing", "not a url")).toEqual({ mode: "soon" });
  });

  it("uses a TestFlight public link as beta, unchanged", () => {
    expect(iosAppLink("landing", "https://testflight.apple.com/join/AbC123")).toEqual({
      mode: "beta",
      url: "https://testflight.apple.com/join/AbC123",
    });
  });

  it("tags an App Store link with a campaign", () => {
    const link = iosAppLink("invite", "https://apps.apple.com/app/solvymed/id123456789?pt=999");
    expect(link.mode).toBe("store");
    const url = new URL((link as { url: string }).url);
    expect(url.searchParams.get("ct")).toBe("solvymed_web_invite");
    expect(url.searchParams.get("pt")).toBe("999");
    expect(url.searchParams.get("mt")).toBe("8");
  });

  it("ignores other hosts and non-https URLs", () => {
    expect(iosAppLink("landing", "https://evil.example/join/x")).toEqual({ mode: "soon" });
    expect(iosAppLink("landing", "http://testflight.apple.com/join/x")).toEqual({ mode: "soon" });
    expect(iosAppLink("landing", "https://testflight.apple.com/v1/app/x")).toEqual({ mode: "soon" });
    expect(iosAppLink("landing", "https://testflight.apple.com/join/")).toEqual({ mode: "soon" });
  });
});
