import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// POST /api/demo/verify (01 + 0e, 10-22): the demo's bot check. The uid comes
// from the verified session (never the body), the address from Vercel's
// x-real-ip, Turnstile is verified server-side, and only then 234's
// issue_demo_ticket runs, with the service role.

const h = vi.hoisted(() => ({
  user: { id: "anon-1", is_anonymous: true } as { id: string; is_anonymous?: boolean } | null,
  bearerUser: null as { id: string; is_anonymous?: boolean } | null,
  rpc: [] as { fn: string; args: unknown; key: string }[],
  rpcError: null as null | { message: string },
  siteverify: { success: true } as Record<string, unknown>,
  verifyBodies: [] as string[],
  startError: null as null | { message: string },
  flags: [{ key: "demo_test_window", enabled: true }, { key: "demo_mode", enabled: false }] as { key: string; enabled: boolean }[],
  flagsError: null as null | { message: string },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async (fn: string, args: unknown) => { h.rpc.push({ fn, args, key: "caller-cookie" }); return { data: null, error: fn === "start_demo" ? h.startError : null }; },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => ({
    auth: { getUser: async () => ({ data: { user: h.bearerUser } }) },
    rpc: async (fn: string, args: unknown) => { h.rpc.push({ fn, args, key }); return { data: { status: "issued" }, error: h.rpcError }; },
    from: (table: string) => ({ select: () => ({ eq: async (col: string, val: string) => (table === "server_flags" ? { data: h.flagsError ? null : h.flags.filter((r) => (r as Record<string, unknown>)[col] === val), error: h.flagsError } : { data: null, error: { message: "no" } }) }) }),
  }),
}));

import { GET, POST } from "@/app/api/demo/verify/route";

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(new URL("/api/demo/verify", "https://www.solvymed.com"), {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
  });

describe("/api/demo/verify", () => {
  beforeEach(() => {
    h.user = { id: "anon-1", is_anonymous: true };
    h.bearerUser = null;
    h.rpc = [];
    h.rpcError = null;
    h.siteverify = { success: true };
    h.verifyBodies = [];
    h.startError = null;
    h.flags = [{ key: "demo_test_window", enabled: true }, { key: "demo_mode", enabled: false }];
    h.flagsError = null;
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      h.verifyBodies.push(String(init.body));
      return new Response(JSON.stringify(h.siteverify), { status: 200 });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("a passed check: the ticket for the SESSION's uid and Vercel's address, with the service role", async () => {
    const res = await POST(req({ token: "tok", p_user: "someone-else" }));
    expect(res.status).toBe(200);
    expect(h.verifyBodies[0]).toContain("response=tok");
    expect(h.verifyBodies[0]).toContain("remoteip=203.0.113.7");
    expect(h.rpc).toEqual([{ fn: "issue_demo_ticket", args: { p_user: "anon-1", p_ip: "203.0.113.7" }, key: "service-role" }]);
  });

  it("a failed check: 403, no ticket", async () => {
    h.siteverify = { success: false };
    const res = await POST(req({ token: "tok" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "turnstile_failed", errors: [] });
    expect(h.rpc).toEqual([]);
  });

  it("a refusal says Cloudflare's reason codes (01: proving the secret), never the secret or the token; the log line too", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_TURNSTILE_SECRET_KEY", "real-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [codes, expected] of [
      [["invalid-input-response"], ["invalid-input-response"]],
      [["invalid-input-secret"], ["invalid-input-secret"]],
      [["timeout-or-duplicate", "x".repeat(60), 7, "<script>"], ["timeout-or-duplicate"]],
    ] as const) {
      h.siteverify = { success: false, "error-codes": codes };
      const res = await POST(req({ token: "the-token" }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ code: "turnstile_failed", errors: expected });
      expect(JSON.stringify(body)).not.toMatch(/real-secret|the-token/);
    }
    // A pass from another widget or site.
    h.siteverify = { success: true, action: "login", hostname: "www.solvymed.com" };
    expect(await (await POST(req({ token: "the-token" }))).json()).toEqual({ code: "turnstile_failed", errors: ["action-or-hostname"] });
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("[demo/verify] turnstile refused: invalid-input-secret");
    expect(logged).not.toMatch(/real-secret|the-token/);
    expect(h.rpc).toEqual([]);
    warn.mockRestore();
  });

  it("a real account or no session: refused before Cloudflare", async () => {
    h.user = { id: "doc-1", is_anonymous: false };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
    h.user = null;
    expect((await POST(req({ token: "tok" }))).status).toBe(401);
    expect(h.verifyBodies).toEqual([]);
    expect(h.rpc).toEqual([]);
  });

  it("#604: with country + locale, the route starts the demo itself as the CALLER, after the ticket", async () => {
    const res = await POST(req({ token: "tok", country: "TH", locale: "th" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
    expect(h.rpc).toEqual([
      { fn: "issue_demo_ticket", args: { p_user: "anon-1", p_ip: "203.0.113.7" }, key: "service-role" },
      { fn: "start_demo", args: { p_country: "TH", p_locale: "th" }, key: "caller-cookie" },
    ]);
  });

  it("#604: Server-Timing carries the durations (siteverify, ticket, start), never values", async () => {
    const res = await POST(req({ token: "tok", country: "BR", locale: "pt-BR" }));
    expect(res.headers.get("Server-Timing")).toMatch(/^siteverify;dur=\d+, ticket;dur=\d+, start;dur=\d+$/);
  });

  it.each(["demo_busy", "demo_off", "unsupported_country", "demo_unverified"])("#604: start_demo refuses with %s → 409 with that code", async (code) => {
    h.startError = { message: code };
    const res = await POST(req({ token: "tok", country: "BR", locale: "pt-BR" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code });
  });

  it("#604: any other start_demo error → 503 start_failed; a failed check never starts", async () => {
    h.startError = { message: "boom" };
    expect((await POST(req({ token: "tok", country: "BR", locale: "pt-BR" }))).status).toBe(503);
    h.rpc = [];
    h.siteverify = { success: false };
    expect((await POST(req({ token: "tok", country: "BR", locale: "pt-BR" }))).status).toBe(403);
    expect(h.rpc).toEqual([]);
  });

  it("without country (the app's first version): only the ticket, {status: issued}", async () => {
    const res = await POST(req({ token: "tok" }));
    expect(await res.json()).toEqual({ status: "issued" });
    expect(h.rpc.map((r) => r.fn)).toEqual(["issue_demo_ticket"]);
  });

  it("#604 F: GET is a no-op warm-up: 204, no session read, nothing called", async () => {
    const res = GET();
    expect(res.status).toBe(204);
    expect(h.rpc).toEqual([]);
    expect(h.verifyBodies).toEqual([]);
  });

  it("no token: 400", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it("Production: the real keys, and the answer must be /demo's widget on our site", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_TURNSTILE_SECRET_KEY", "real-secret");
    h.siteverify = { success: true, action: "login", hostname: "www.solvymed.com" };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
    h.siteverify = { success: true, action: "demo", hostname: "evil.example" };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
    h.siteverify = { success: true, action: "demo", hostname: "www.solvymed.com" };
    expect((await POST(req({ token: "tok" }))).status).toBe(200);
    expect(h.verifyBodies.every((b) => b.includes("secret=real-secret"))).toBe(true);
  });

  it("Production without the secret: 503, nothing sent", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_TURNSTILE_SECRET_KEY", "");
    expect((await POST(req({ token: "tok" }))).status).toBe(503);
    expect(h.verifyBodies).toEqual([]);
  });

  const combos = [
    { window: true, mode: false },
    { window: false, mode: false },
    { window: true, mode: true },
    { window: false, mode: true },
  ];
  const setFlags = (c: { window: boolean; mode: boolean }) => {
    h.flags = [{ key: "demo_test_window", enabled: c.window }, { key: "demo_mode", enabled: c.mode }];
  };

  it.each(combos)("a preview (always-pass keys), window $window / demo_mode $mode: a ticket whenever the testers' window is on, demo_mode or not (01, 83: the demo is public now)", async (c) => {
    setFlags(c);
    const res = await POST(req({ token: "tok" }));
    if (c.window) {
      expect(res.status).toBe(200);
      expect(h.rpc.map((r) => r.fn)).toEqual(["issue_demo_ticket"]);
    } else {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "demo_preview_closed" });
      expect(h.rpc).toEqual([]);
      expect(h.verifyBodies).toEqual([]);
    }
  });

  it("a preview whose flag read fails: closed, no ticket", async () => {
    h.flagsError = { message: "down" };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
    expect(h.rpc).toEqual([]);
  });

  it.each(combos)("Production, window $window / demo_mode $mode: always the real check, never the preview rule", async (c) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_TURNSTILE_SECRET_KEY", "real-secret");
    setFlags(c);
    h.siteverify = { success: true, action: "demo", hostname: "www.solvymed.com" };
    expect((await POST(req({ token: "tok" }))).status).toBe(200);
    expect(h.verifyBodies[0]).toContain("secret=real-secret");
    h.siteverify = { success: false };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
  });

  it.each(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"])("Production never uses a Cloudflare test secret (%s): 503, nothing sent", async (secret) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_TURNSTILE_SECRET_KEY", secret);
    expect((await POST(req({ token: "tok" }))).status).toBe(503);
    expect(h.verifyBodies).toEqual([]);
    expect(h.rpc).toEqual([]);
  });

  it("the app's Bearer session works the same", async () => {
    h.user = null;
    h.bearerUser = { id: "anon-app", is_anonymous: true };
    const res = await POST(req({ token: "tok" }, { authorization: "Bearer jwt" }));
    expect(res.status).toBe(200);
    expect((h.rpc[0].args as { p_user: string }).p_user).toBe("anon-app");
  });
});
