// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { userWithRefresh } from "@/lib/supabase/userWithRefresh";

// ec on #521: a device whose clock is fast stores a token expiry shifted to
// its own clock; the server (by its own clock) trusts that expiry, skips
// its usual refresh, and sends a token that has really expired, which
// getUser refuses → the doctor looked signed out. userWithRefresh (the
// middleware's) refreshes once and retries.

describe("userWithRefresh", () => {
  const user = { id: "u1" };
  it("a valid session: the user, no refresh", async () => {
    const refreshSession = vi.fn(async () => ({ error: null }));
    expect(await userWithRefresh({ getUser: async () => ({ data: { user }, error: null }), refreshSession })).toBe(user);
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("no session at all: no user, no refresh", async () => {
    const refreshSession = vi.fn(async () => ({ error: null }));
    expect(await userWithRefresh({ getUser: async () => ({ data: { user: null }, error: { name: "AuthSessionMissingError" } }), refreshSession })).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("an expired token: one refresh, then the user", async () => {
    let n = 0;
    const getUser = vi.fn(async () => (n++ === 0 ? { data: { user: null }, error: { name: "AuthApiError", status: 403, code: "bad_jwt", message: "token is expired" } } : { data: { user }, error: null }));
    expect(await userWithRefresh({ getUser, refreshSession: async () => ({ error: null }) })).toBe(user);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
  it("the refresh fails (a revoked session): no user", async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: { name: "AuthApiError", status: 403, code: "bad_jwt" } }));
    expect(await userWithRefresh({ getUser, refreshSession: async () => ({ error: { message: "Invalid Refresh Token" } }) })).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});

describe("ec's case with the real auth client (server clock, a cookie shifted +2 h)", () => {
  it("the stored expiry says valid, the token has really expired: still signed in", async () => {
    const NOW = Math.floor(Date.now() / 1000);
    const userJson = { id: "u1", aud: "authenticated", role: "authenticated", email: "x@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    // What the fast device stored: expired 10 min ago by the server's clock,
    // but its expiry shifted 2 h ahead.
    const stored = { access_token: "expired", refresh_token: "r0", token_type: "bearer", expires_in: 3600, expires_at: NOW - 600 + 7200, user: userJson };
    const store = new Map<string, string>([["k", JSON.stringify(stored)]]);
    let refreshes = 0;
    const server = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const auth = new Headers(init?.headers).get("Authorization") ?? "";
      if (u.includes("grant_type=refresh_token")) {
        refreshes++;
        return Response.json({ access_token: "fresh", refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: NOW + 3600, user: userJson });
      }
      if (u.endsWith("/auth/v1/user")) {
        return auth.endsWith("fresh") ? Response.json(userJson) : Response.json({ code: "bad_jwt", msg: "invalid JWT: token is expired" }, { status: 403 });
      }
      return Response.json({});
    });
    const sb = createClient("https://x.supabase.co", "anon", {
      global: { fetch: server as unknown as typeof fetch },
      auth: { storageKey: "k", storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) }, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    });
    // The plain getUser: refused (what the middleware saw before).
    expect((await sb.auth.getUser()).data.user).toBeNull();
    // With the refresh-once: signed in, with the new token stored.
    const user = await userWithRefresh<{ id: string }>(sb.auth);
    expect(user?.id).toBe("u1");
    expect(refreshes).toBe(1);
    expect(JSON.parse(store.get("k")!).access_token).toBe("fresh");
  });
});

describe("the server client's getUser (pages and actions)", () => {
  it("refreshes once on an expired token and returns the user; a passed JWT is checked as is", async () => {
    vi.resetModules();
    const calls: string[] = [];
    let fresh = false;
    const fakeAuth = {
      getUser: vi.fn(async (jwt?: string) => {
        calls.push(jwt ? `getUser(${jwt})` : "getUser");
        return fresh || jwt ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { name: "AuthApiError", status: 403, code: "bad_jwt" } };
      }),
      refreshSession: vi.fn(async () => { calls.push("refresh"); fresh = true; return { error: null }; }),
    };
    vi.doMock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }) }));
    vi.doMock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: fakeAuth }) }));
    const { createClient: serverClient } = await import("@/lib/supabase/server");
    const sb = await serverClient({ acting: false });
    expect((await sb.auth.getUser()).data.user).toEqual({ id: "u1" });
    expect(calls).toEqual(["getUser", "refresh", "getUser"]);
    calls.length = 0;
    await sb.auth.getUser("a.jwt");
    expect(calls).toEqual(["getUser(a.jwt)"]);
    vi.doUnmock("next/headers");
    vi.doUnmock("@supabase/ssr");
  });
});
