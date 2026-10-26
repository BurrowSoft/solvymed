// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Google round trip (232): the callback sends a NEW Google account (232's
// pending marker) to "Complete your account" with the country and role it
// carried, an existing one where a sign-in goes; gr= marks which. The
// middleware sends a pending account's dashboard visits back there; an
// unlinked patient (no marker) keeps its own routing.

const db = vi.hoisted(() => ({
  pending: false as boolean,
  fail: null as null | "error" | "throw",
  role: null as { role: string; invited_by_professional_id: string | null } | null,
  rpcs: [] as string[],
  linkTypes: [] as (string | null)[],
  counts: [] as string[],
}));
// 238: a new account from the demo's Google button counts signup_from_demo.
vi.mock("@/lib/demoMetricsServer", () => ({ demoCountServer: async (...a: string[]) => { db.counts.push(a.join(" ")); } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { session: {}, user: { id: "u1", user_metadata: {} } }, error: null }),
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.role, error: null }) }) }) }),
    rpc: async (fn: string) => {
      db.rpcs.push(fn);
      if (fn !== "signup_onboarding_is_pending") return { data: [], error: null };
      if (db.fail === "throw") throw new Error("network down");
      if (db.fail === "error") return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      return { data: db.pending, error: null };
    },
  }),
}));
vi.mock("@/lib/authRouting", () => ({
  routeAfterAuth: async (_s: unknown, _u: unknown, prefix: string, linkType: string | null) => {
    db.linkTypes.push(linkType);
    return `${prefix}/dashboard`;
  },
}));

type Handler = (req: NextRequest) => Promise<Response>;
let GET: Handler;
let middleware: Handler;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ GET } = (await import("@/app/api/auth/callback/route")) as { GET: Handler });
  ({ middleware } = (await import("@/middleware")) as { middleware: Handler });
});
beforeEach(() => {
  db.pending = false;
  db.fail = null;
  db.role = null;
  db.rpcs = [];
  db.linkTypes = [];
  db.counts = [];
});

const call = (q: string) => GET(new NextRequest(new URL(`/api/auth/callback?code=abc&${q}`, "https://www.solvymed.com")));
const loc = (res: Response) => new URL(res.headers.get("location")!);

describe("the callback after Google", () => {
  it("a new Google account → Complete your account, with the country and role it carried", async () => {
    db.pending = true;
    const to = loc(await call("locale=th&google=signup&c=TH&role=professional"));
    expect(to.pathname).toBe("/th/auth/complete-account");
    expect(Object.fromEntries(to.searchParams)).toEqual({ c: "TH", role: "professional", gr: "new" });
  });

  it("from the demo (via=demo): a NEW account counts signup_from_demo once; an existing one or no via doesn't", async () => {
    db.pending = true;
    await call("locale=th&google=signup&c=TH&role=professional&via=demo");
    expect(db.counts).toEqual(["signup_from_demo TH th"]);
    await call("locale=th&google=signup&c=TH&role=professional");
    expect(db.counts).toHaveLength(1);
    db.pending = false;
    await call("locale=th&google=signup&c=TH&via=demo");
    expect(db.counts).toHaveLength(1);
  });

  it("junk country / role are dropped", async () => {
    db.pending = true;
    const to = loc(await call("locale=pt-BR&google=signup&c=US&role=admin"));
    expect(Object.fromEntries(to.searchParams)).toEqual({ gr: "new" });
  });

  it("an existing account → the usual routing as a sign-in (never the welcome), marked existing", async () => {
    const to = loc(await call("locale=pt-BR&google=login"));
    expect(to.pathname).toBe("/pt-BR/dashboard");
    expect(to.searchParams.get("gr")).toBe("existing");
    expect(db.linkTypes).toEqual(["oauth"]);
  });

  it.each(["error", "throw"] as const)("FAIL SAFE in the callback: the pending RPC %ss → the usual routing", async (fail) => {
    db.fail = fail;
    const to = loc(await call("locale=pt-BR&google=signup&c=BR"));
    expect(to.pathname).toBe("/pt-BR/dashboard");
    expect(to.searchParams.get("gr")).toBe("existing");
  });

  it("a PKCE return that isn't ours (no google=): no pending check, no marker", async () => {
    const to = loc(await call("locale=pt-BR"));
    expect(to.pathname).toBe("/pt-BR/dashboard");
    expect(to.searchParams.has("gr")).toBe(false);
    expect(db.rpcs).not.toContain("signup_onboarding_is_pending");
    expect(db.linkTypes).toEqual([null]);
  });
});

describe("the middleware guard on dashboard routes", () => {
  const go = (path: string) =>
    middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers: { cookie: "NEXT_LOCALE=pt-BR" } }));

  it("a pending Google account → Complete your account", async () => {
    db.pending = true;
    const res = await go("/pt-BR/dashboard");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pt-BR/auth/complete-account");
  });

  it("no marker (an unlinked patient): not sent there", async () => {
    db.pending = false;
    const res = await go("/pt-BR/dashboard");
    expect(res.headers.get("location") ?? "").not.toContain("complete-account");
  });

  it.each(["error", "throw"] as const)("FAIL SAFE: the pending RPC %ss (232 not live, network): routed exactly as before", async (fail) => {
    db.fail = fail;
    const res = await go("/pt-BR/dashboard");
    expect(res.headers.get("location") ?? "").not.toContain("complete-account");
    expect(res.status).toBeLessThan(500);
  });

  it("an account with a role never asks", async () => {
    db.role = { role: "professional", invited_by_professional_id: null };
    await go("/pt-BR/dashboard");
    expect(db.rpcs).not.toContain("signup_onboarding_is_pending");
  });
});
