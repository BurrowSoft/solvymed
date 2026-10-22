import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Funnel F5: on an Android phone the landing's first CTA is Google Play (+
// "or continue on the website"). The inline script marks <html>; the CSS
// shows the Play CTA and hides the signup CTA; no mark = as before. The Play
// referrer carries the visit's utm_source/medium/campaign only with
// marketing consent (privacy §3.6), never click ids. app_store_click {platform, c}.

const h = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: h.track }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { AndroidAppCta } from "@/components/AndroidAppCta";
import { isAndroidPhone, PLATFORM_SCRIPT, visitReferrer } from "@/lib/appStores";

const cta = (locale = "pt-BR") => (
  <AndroidAppCta locale={locale} label="Baixe o app no Google Play" webLabel="ou continue pelo site" className="p" webClassName="w" />
);
const consent = (marketing: boolean) => {
  document.cookie = `sm_consent=1.1${marketing ? 1 : 0}.${Math.floor(Date.now() / 1000)}; path=/`;
};

describe("platform detection", () => {
  it("Android phones only (tablets and iPhones keep the page)", () => {
    expect(isAndroidPhone("Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/129.0 Mobile Safari/537.36")).toBe(true);
    expect(isAndroidPhone("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/129.0 Safari/537.36")).toBe(false);
    expect(isAndroidPhone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148")).toBe(false);
    expect(isAndroidPhone(null)).toBe(false);
  });

  it("the inline script marks <html data-platform=android> on an Android phone", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile");
    document.documentElement.removeAttribute("data-platform");
    new Function(PLATFORM_SCRIPT)();
    expect(document.documentElement.getAttribute("data-platform")).toBe("android");
    ua.mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    document.documentElement.removeAttribute("data-platform");
    new Function(PLATFORM_SCRIPT)();
    expect(document.documentElement.getAttribute("data-platform")).toBeNull();
    ua.mockRestore();
  });

  it("the CSS: Play CTA hidden by default, shown and the signup hidden on Android", () => {
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/\.android-only \{ display: none; \}/);
    expect(css).toMatch(/html\[data-platform="android"\] \.android-only \{ display: flex; \}/);
    expect(css).toMatch(/html\[data-platform="android"\] \.android-hide \{ display: none; \}/);
  });
});

describe("visitReferrer", () => {
  it("utm_source/medium/campaign only, sanitised; nothing without a source or campaign", () => {
    expect(visitReferrer({ utm_source: "youtube", utm_medium: "video", utm_campaign: "ep 07<x>" })).toBe("utm_source=youtube&utm_medium=video&utm_campaign=ep07x");
    expect(visitReferrer({ utm_medium: "video" })).toBeNull();
    expect(visitReferrer(null)).toBeNull();
  });
});

describe("AndroidAppCta", () => {
  beforeEach(() => {
    h.track.mockReset();
    document.cookie = "sm_consent=; Max-Age=0; path=/";
    document.cookie = "sm_attr=; Max-Age=0; path=/";
    window.history.replaceState(null, "", "/pt-BR?utm_source=youtube&utm_medium=video&utm_campaign=ep07&gclid=abc");
  });

  it("server HTML: the Play link and the signup link, in the hidden-by-default wrapper", () => {
    const div = document.createElement("div");
    div.innerHTML = renderToString(cta());
    const wrap = div.querySelector("[data-testid=android-app-cta]")!;
    expect(wrap.className).toContain("android-only");
    expect(wrap.querySelector("a[href*='play.google.com']")).not.toBeNull();
    expect(wrap.querySelector("a[href*='/auth/signup']")).not.toBeNull();
  });

  it("without marketing consent: the page's fixed referrer; the event carries platform + c", () => {
    consent(false);
    render(cta("th"));
    const play = screen.getByTestId("android-app-cta-play") as HTMLAnchorElement;
    play.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(play);
    const referrer = new URL(play.href).searchParams.get("referrer")!;
    expect(referrer).toBe("utm_source=solvymed_web&utm_medium=web&utm_campaign=landing");
    expect(h.track).toHaveBeenCalledWith("app_store_click", { platform: "android", c: "TH" });
  });

  it("with marketing consent: the visit's utm as the referrer, never click ids", () => {
    consent(true);
    render(cta());
    const play = screen.getByTestId("android-app-cta-play") as HTMLAnchorElement;
    play.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(play);
    const referrer = new URL(play.href).searchParams.get("referrer")!;
    expect(referrer).toBe("utm_source=youtube&utm_medium=video&utm_campaign=ep07");
    expect(play.href).not.toContain("gclid");
    // The Play Store app, in this tab (01): an intent with the website as fallback.
    expect(play.href.startsWith("intent://details?id=com.burrowsoft.solvymed&")).toBe(true);
    expect(play.href).toContain("#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2F");
    expect(play.target).toBe("_self");
  });

  it("in a plain Android WebView (\"; wv)\"): the https listing in a new tab, as before (cf)", () => {
    consent(false);
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0");
    render(cta());
    const play = screen.getByTestId("android-app-cta-play") as HTMLAnchorElement;
    play.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(play);
    expect(play.href.startsWith("https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed&referrer=")).toBe(true);
    expect(play.target).toBe("_blank");
    ua.mockRestore();
    expect(h.track).toHaveBeenCalledWith("app_store_click", { platform: "android", c: "BR" });
  });
});
