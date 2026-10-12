import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { isSkewed, measureSkew, SKEW_LIMIT_MS, skewMs } from "@/lib/clockSkew";

// 1.9.0 item 1.7: a device clock that's wrong. The background token
// refresh starts only once the clock checks out; while it's more than 5
// minutes off, it stays stopped and a banner says how to fix it.

const auth = vi.hoisted(() => ({ startAutoRefresh: vi.fn(async () => {}), stopAutoRefresh: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
import { ClockSkewGuard } from "@/components/ClockSkewGuard";

const serverSays = (offsetMs: number) => vi.fn(async () => new Response(JSON.stringify({ now: Date.now() - offsetMs }), { status: 200 }));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("lib/clockSkew", () => {
  it("the offset from one round trip, and the 5-minute limit either way", () => {
    expect(skewMs(1_000, 3_000, 2_000)).toBe(0);
    expect(skewMs(7_200_000, 7_200_100, 50)).toBe(7_200_000);
    expect(isSkewed(SKEW_LIMIT_MS)).toBe(false);
    expect(isSkewed(SKEW_LIMIT_MS + 1)).toBe(true);
    expect(isSkewed(-(SKEW_LIMIT_MS + 1))).toBe(true);
  });

  it("asks /api/time, uncached; a failed check is null (never blocks)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ now: 1_000 }), { status: 200 }));
    let t = 1_000;
    expect(await measureSkew(f as unknown as typeof fetch, () => (t += 0))).toBe(0);
    expect(f).toHaveBeenCalledWith("/api/time", { cache: "no-store" });
    expect(await measureSkew((async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toBeNull();
    expect(await measureSkew((async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toBeNull();
    expect(await measureSkew((async () => new Response(JSON.stringify({ x: 1 }), { status: 200 })) as unknown as typeof fetch)).toBeNull();
  });
});

describe("ClockSkewGuard", () => {
  const show = () => render(<NextIntlClientProvider locale="en" messages={en}><ClockSkewGuard /></NextIntlClientProvider>);

  it("a right clock: the background refresh starts, no banner", async () => {
    vi.stubGlobal("fetch", serverSays(30_000));
    show();
    await settle();
    expect(auth.startAutoRefresh).toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId("clock-skew-banner")).toBeNull();
  });

  it("a clock 2 h fast: the banner says how to fix it; the refresh runs (expiries shifted to this clock)", async () => {
    vi.stubGlobal("fetch", serverSays(2 * 3_600_000));
    show();
    await settle();
    expect(auth.startAutoRefresh).toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("clock-skew-banner").textContent).toBe(en.clockSkew.banner);
  });

  it("the check itself fails: treated as right (refresh on, no banner)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    show();
    await settle();
    expect(auth.startAutoRefresh).toHaveBeenCalled();
    expect(screen.queryByTestId("clock-skew-banner")).toBeNull();
  });

  it("the clock fixed while the tab was away: re-checked on return, the banner goes, the refresh restarts", async () => {
    const fetchMock = serverSays(2 * 3_600_000);
    vi.stubGlobal("fetch", fetchMock);
    show();
    await settle();
    expect(screen.getByTestId("clock-skew-banner")).toBeInTheDocument();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ now: Date.now() }), { status: 200 }));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(screen.queryByTestId("clock-skew-banner")).toBeNull();
    expect(auth.startAutoRefresh).toHaveBeenCalled();
  });

  it("the banner text exists in every language", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    for (const f of readdirSync("src/messages")) {
      const m = JSON.parse(readFileSync(`src/messages/${f}`, "utf8").replace(/^﻿/, ""));
      expect(typeof m.clockSkew?.banner, f).toBe("string");
    }
  });
});

describe("the browser auth client and /api/time", () => {
  it("the browser client starts with the background refresh off", async () => {
    vi.doUnmock("@/lib/supabase/client");
    vi.resetModules();
    const seen: unknown[] = [];
    vi.doMock("@supabase/ssr", () => ({ createBrowserClient: (...a: unknown[]) => { seen.push(a[2]); return {}; } }));
    const { createClient } = await import("@/lib/supabase/client");
    createClient();
    expect(seen[0]).toMatchObject({ auth: { autoRefreshToken: false } });
    vi.doUnmock("@supabase/ssr");
  });

  it("/api/time answers the server's time, uncached", async () => {
    const { GET } = await import("@/app/api/time/route");
    const before = Date.now();
    const res = GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const { now } = (await res.json()) as { now: number };
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
