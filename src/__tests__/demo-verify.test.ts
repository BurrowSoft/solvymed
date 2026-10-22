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
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => ({
    auth: { getUser: async () => ({ data: { user: h.bearerUser } }) },
    rpc: async (fn: string, args: unknown) => { h.rpc.push({ fn, args, key }); return { data: { status: "issued" }, error: h.rpcError }; },
  }),
}));

import { POST } from "@/app/api/demo/verify/route";

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
    expect(await res.json()).toEqual({ code: "turnstile_failed" });
    expect(h.rpc).toEqual([]);
  });

  it("a real account or no session: refused before Cloudflare", async () => {
    h.user = { id: "doc-1", is_anonymous: false };
    expect((await POST(req({ token: "tok" }))).status).toBe(403);
    h.user = null;
    expect((await POST(req({ token: "tok" }))).status).toBe(401);
    expect(h.verifyBodies).toEqual([]);
    expect(h.rpc).toEqual([]);
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

  it("the app's Bearer session works the same", async () => {
    h.user = null;
    h.bearerUser = { id: "anon-app", is_anonymous: true };
    const res = await POST(req({ token: "tok" }, { authorization: "Bearer jwt" }));
    expect(res.status).toBe(200);
    expect((h.rpc[0].args as { p_user: string }).p_user).toBe("anon-app");
  });
});
