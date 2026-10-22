import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// /<locale>/demo/verify-app (01's option B, 0e): the app's WebView gets the
// Turnstile token by postMessage; a Custom Tab only through the app's own
// return link, exactly; no banner, noindex.

const h = vi.hoisted(() => ({ handlers: null as null | { onToken: (t: string) => void; onError: (c: string) => void } }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useParams: () => ({ locale: "pt-BR" }) }));
vi.mock("@/components/DemoTurnstile", () => ({
  DemoTurnstile: (p: { onToken: (t: string) => void; onError: (c: string) => void }) => { h.handlers = p; return <div data-testid="widget" />; },
}));

import { APP_RETURN, VerifyAppClient } from "@/app/[locale]/(site)/demo/verify-app/VerifyAppClient";
import { metadata } from "@/app/[locale]/(site)/demo/verify-app/page";
import { isTransactionalPath } from "@/lib/consent";

const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="pt-BR" messages={pt}>{node}</NextIntlClientProvider>;
const replace = vi.fn();
const original = window.location;
const at = (search: string) => Object.defineProperty(window, "location", { configurable: true, value: { ...original, search, replace } });

describe("/demo/verify-app", () => {
  beforeEach(() => { replace.mockClear(); h.handlers = null; at(""); });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  });

  it("in the app's WebView: the token by postMessage, nothing else", () => {
    const postMessage = vi.fn();
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
    render(wrap(<VerifyAppClient siteKey="site" />));
    expect(screen.getByText(pt.demo.verifying)).toBeInTheDocument();
    act(() => h.handlers!.onToken("tok"));
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "turnstile", token: "tok" }));
    expect(replace).not.toHaveBeenCalled();
  });

  it("an error or expiry: postMessage turnstile-error with the code, and a retry", () => {
    const postMessage = vi.fn();
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
    render(wrap(<VerifyAppClient siteKey="site" />));
    act(() => h.handlers!.onError("expired"));
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "turnstile-error", code: "expired" }));
    fireEvent.click(screen.getByText(pt.demo.retry));
    expect(screen.queryByText(pt.demo.retry)).toBeNull();
  });

  it("a Custom Tab: only the exact app return link gets the token", () => {
    at(`?return=${encodeURIComponent(APP_RETURN)}`);
    render(wrap(<VerifyAppClient siteKey="site" />));
    act(() => h.handlers!.onToken("a b"));
    expect(replace).toHaveBeenCalledWith("solvymed://demo-verify#token=a%20b");
  });

  it.each(["https://evil.example/", "solvymed://demo-verify.evil", "solvymed://other", "javascript:alert(1)"])("any other return (%s): the token goes nowhere", (ret) => {
    at(`?return=${encodeURIComponent(ret)}`);
    render(wrap(<VerifyAppClient siteKey="site" />));
    act(() => h.handlers!.onToken("tok"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("never framed: DENY site-wide plus frame-ancestors none on this page (cf)", async () => {
    const { default: config } = await import("../../next.config");
    const rules = await (config as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }).headers();
    const all = rules.find((r) => r.source === "/(.*)")!;
    expect(all.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    for (const source of ["/demo/verify-app", "/:locale/demo/verify-app"]) {
      expect(rules.find((r) => r.source === source)?.headers).toContainEqual({ key: "Content-Security-Policy", value: "frame-ancestors 'none'" });
    }
  });

  it("noindex, and no consent banner on this page", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(isTransactionalPath("/pt-BR/demo/verify-app", ["pt-BR", "en", "th"])).toBe(true);
    expect(isTransactionalPath("/pt-BR/demo", ["pt-BR", "en", "th"])).toBe(false);
  });
});
