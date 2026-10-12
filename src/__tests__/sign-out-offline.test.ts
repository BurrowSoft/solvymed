import { describe, expect, it, vi } from "vitest";
import { signOutHere } from "@/lib/signOut";

// 1.9.0 offline guard (7e's #512 row): offline, the server sign-out fails
// and the auth client kept the session: this browser stayed signed in.

describe("signOutHere", () => {
  const AUTH = ["sb-abc-auth-token", "sb-abc-auth-token.0", "sb-abc-auth-token.1", "sb-abc-auth-token-code-verifier"];
  const cookies = () => document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter(Boolean);

  it("offline, the auth cookies go at once even though auth-js's local sign-out fails too (7e's ❌)", async () => {
    for (const n of [...AUTH, "NEXT_LOCALE"]) document.cookie = `${n}=v; path=/`;
    // As auth-js: "local" also calls the server first, and keeps the session when it can't.
    const offline = vi.fn(async () => ({ error: { name: "AuthRetryableFetchError" } }));
    const stopAutoRefresh = vi.fn();
    await signOutHere({ signOut: offline, stopAutoRefresh });
    expect(offline.mock.calls).toEqual([[], [{ scope: "local" }]]);
    expect(stopAutoRefresh).toHaveBeenCalled();
    expect(cookies().filter((n) => AUTH.includes(n))).toEqual([]);
    // Other cookies stay.
    expect(cookies()).toContain("NEXT_LOCALE");
    document.cookie = "NEXT_LOCALE=; Max-Age=0; path=/";
  });
  it("online, nothing extra: the server sign-out has already removed the session", async () => {
    document.cookie = "sb-abc-auth-token=v; path=/";
    await signOutHere({ signOut: vi.fn(async () => ({ error: null })) });
    // (auth-js removed it itself; this fake doesn't, so it's still here)
    expect(cookies()).toContain("sb-abc-auth-token");
    document.cookie = "sb-abc-auth-token=; Max-Age=0; path=/";
  });

  it("the server answers: one sign-out, everywhere", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await signOutHere({ signOut });
    expect(signOut.mock.calls).toEqual([[]]);
  });
  it("the server can't be reached (an error, or a throw): this browser's session is removed anyway", async () => {
    const failing = vi.fn(async (opts?: { scope?: string }) => (opts?.scope === "local" ? { error: null } : { error: { name: "AuthRetryableFetchError" } }));
    await signOutHere({ signOut: failing });
    expect(failing.mock.calls).toEqual([[], [{ scope: "local" }]]);
    const throwing = vi.fn(async (opts?: { scope?: string }) => { if (!opts) throw new TypeError("Failed to fetch"); return { error: null }; });
    await signOutHere({ signOut: throwing });
    expect(throwing.mock.calls).toEqual([[], [{ scope: "local" }]]);
  });
});

import { flushPendingSignOut, PENDING_KEY } from "@/lib/signOut";

describe("a sign-out made offline is finished on the server later (02)", () => {
  const session = { access_token: "at", refresh_token: "rt" };
  const failing = () => vi.fn(async (opts?: { scope?: string }) => (opts?.scope === "local" ? { error: null } : { error: { name: "AuthRetryableFetchError" } }));

  it("the server can't be reached: the session's tokens are kept for the revoke; a normal sign-out keeps nothing", async () => {
    localStorage.clear();
    await signOutHere({ signOut: vi.fn(async () => ({ error: null })), getSession: async () => ({ data: { session } }) });
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    await signOutHere({ signOut: failing(), getSession: async () => ({ data: { session } }) });
    expect(JSON.parse(localStorage.getItem(PENDING_KEY)!)).toEqual(session);
  });

  it("online again: the server sign-out with the kept token, then forgotten", async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(session));
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await flushPendingSignOut("https://x.supabase.co", "anon", f as unknown as typeof fetch)).toBe("done");
    // Only the abandoned session, never the user's later ones (ec).
    expect(f).toHaveBeenCalledWith("https://x.supabase.co/auth/v1/logout?scope=local", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer at" }) }));
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("the access token expired meanwhile: a refresh first, then the sign-out with the new one", async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(session));
    const calls: string[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get("Authorization");
      calls.push(`${url.split("/auth/v1/")[1]} ${auth ?? ""}`.trim());
      if (url.includes("grant_type=refresh_token")) return Response.json({ access_token: "new" });
      return new Response(null, { status: auth === "Bearer at" ? 401 : 204 });
    });
    expect(await flushPendingSignOut("https://x.supabase.co", "anon", f as unknown as typeof fetch)).toBe("done");
    expect(calls).toEqual(["logout?scope=local Bearer at", "token?grant_type=refresh_token", "logout?scope=local Bearer new"]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("still offline: kept for the next try; a refresh token that no longer works: nothing left to revoke", async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(session));
    expect(await flushPendingSignOut("https://x.supabase.co", "anon", (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toBe("later");
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
    const f = vi.fn(async (url: string) => (url.includes("refresh_token") ? new Response("{}", { status: 400 }) : new Response(null, { status: 401 })));
    expect(await flushPendingSignOut("https://x.supabase.co", "anon", f as unknown as typeof fetch)).toBe("done");
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(await flushPendingSignOut("https://x.supabase.co", "anon", f as unknown as typeof fetch)).toBe("none");
  });
});
