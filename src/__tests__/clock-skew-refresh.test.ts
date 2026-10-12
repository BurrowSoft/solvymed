// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { setKnownSkew, skewAwareFetch } from "@/lib/clockSkew";

// ec on #521: the auth client compares a token's expiry with the DEVICE
// clock on every request, so stopping its background refresh isn't enough:
// with the device 2 h fast, each Supabase request refreshed the token (10
// requests → 10 refreshes, measured). skewAwareFetch shifts each issued
// token's expiry by the measured offset; then the device's own comparison
// is right and a 10-minute session refreshes at most once (the stored
// session from before the shift).

const SERVER_NOW = Math.floor(Date.UTC(2026, 9, 13, 12) / 1000);

async function session(opts: { skewSeconds: number; known: boolean; ticker: boolean }) {
  vi.useFakeTimers({ now: (SERVER_NOW + opts.skewSeconds) * 1000 });
  setKnownSkew(opts.known ? opts.skewSeconds * 1000 : null);
  let refreshes = 0;
  const token = () => ({
    access_token: `a${refreshes}`, refresh_token: `r${refreshes}`, token_type: "bearer", expires_in: 3600,
    // The server's clock (it doesn't move with the device's).
    expires_at: SERVER_NOW + Math.floor((Date.now() / 1000 - opts.skewSeconds) - SERVER_NOW) + 3600,
    user: { id: "u1", aud: "authenticated", role: "authenticated", email: "x@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  });
  const server = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("grant_type=refresh_token")) {
      refreshes++;
      return new Response(JSON.stringify(token()), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  });
  const store = new Map<string, string>([["k", JSON.stringify(token())]]);
  const sb = createClient("https://x.supabase.co", "anon", {
    global: { fetch: skewAwareFetch(server as unknown as typeof fetch) },
    auth: { storageKey: "k", storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) }, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });
  if (opts.ticker) await sb.auth.startAutoRefresh();
  // A doctor's 10 minutes: one Supabase request from the page each minute.
  for (let i = 0; i < 10; i++) {
    await sb.from("patients").select("id");
    await vi.advanceTimersByTimeAsync(60_000);
  }
  if (opts.ticker) await sb.auth.stopAutoRefresh();
  return refreshes;
}

afterEach(() => { vi.useRealTimers(); setKnownSkew(null); });

describe("a device 2 h fast, over 10 minutes", () => {
  it("without the shift (the skew unknown): a refresh per request, the problem ec found", async () => {
    expect(await session({ skewSeconds: 7200, known: false, ticker: false })).toBe(10);
  }, 30_000);

  it("with the measured skew: at most one refresh, requests or ticker", async () => {
    expect(await session({ skewSeconds: 7200, known: true, ticker: false })).toBeLessThanOrEqual(1);
    expect(await session({ skewSeconds: 7200, known: true, ticker: true })).toBeLessThanOrEqual(1);
  }, 30_000);

  it("a right clock: no refresh, and nothing is shifted", async () => {
    expect(await session({ skewSeconds: 0, known: true, ticker: true })).toBe(0);
  }, 30_000);

  it("a clock 2 h SLOW is shifted too (tokens would look valid after they expire)", async () => {
    expect(await session({ skewSeconds: -7200, known: true, ticker: false })).toBeLessThanOrEqual(1);
  }, 30_000);
});
