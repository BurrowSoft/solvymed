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

describe("androidStoreLink (01: the Play Store app, not its website, from in-app browsers)", () => {
  it("an intent to market:// with the same id and referrer, and the exact web link as the fallback", async () => {
    const { androidStoreLink, playStoreUrl } = await import("@/lib/appStores");
    const web = playStoreUrl("landing", "ep07");
    const link = androidStoreLink(web);
    expect(link).toBe(`intent://details?id=com.burrowsoft.solvymed&referrer=${encodeURIComponent("utm_source=solvymed_web&utm_medium=web&utm_campaign=landing&utm_content=ep07")}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(web)};end`);
    const u = new URL(link);
    expect(u.searchParams.get("referrer")).toBe("utm_source=solvymed_web&utm_medium=web&utm_campaign=landing&utm_content=ep07");
    expect(decodeURIComponent(u.hash.match(/S.browser_fallback_url=([^;]+)/)![1])).toBe(web);
  });

  it("no referrer: none added", async () => {
    const { androidStoreLink } = await import("@/lib/appStores");
    expect(androidStoreLink("https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed")).toBe(
      "intent://details?id=com.burrowsoft.solvymed#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.burrowsoft.solvymed;end",
    );
  });
});

describe("storeLinkForAgent (cf: plain WebViews keep https)", () => {
  it("\"; wv)\" → the https link; Chrome, a Custom Tab, Samsung Internet → the intent", async () => {
    const { storeLinkForAgent, androidStoreLink, playStoreUrl } = await import("@/lib/appStores");
    const web = playStoreUrl("landing");
    expect(storeLinkForAgent("Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]", web)).toBe(web);
    for (const ua of [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
    ]) expect(storeLinkForAgent(ua, web)).toBe(androidStoreLink(web));
  });
});
