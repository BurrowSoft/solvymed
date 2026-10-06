// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { landingDestination } from "@/lib/landingRoute";
import { teamAccessKey } from "@/lib/teamAccess";

// Vitor, 6 Oct: a secretary removed from her last practice kept a live
// session; a client navigation kept the dashboard shell (and tour) and the
// home page bounced her to the login, and "/" sent her to the dashboard
// again. Now no dashboard request (full load or client navigation) reaches
// a page: she goes to "not part of any team". A choice of a doctor she no
// longer serves is dropped, back on her primary.

const db = vi.hoisted(() => ({
  user: { id: "sec-1" } as { id: string } | null,
  role: null as { role: string; invited_by_professional_id: string | null } | null,
  practices: [] as { professional_id: string }[],
  rpcCalls: 0,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.role, error: null }) }) }) }),
    rpc: async () => { db.rpcCalls++; return { data: db.practices, error: null }; },
  }),
}));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, multiPractice: true } };
});

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.resetModules();
  ({ middleware } = (await import("@/middleware")) as { middleware: Middleware });
});

beforeEach(() => {
  db.user = { id: "sec-1" };
  db.role = null;
  db.practices = [];
  db.rpcCalls = 0;
});

const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// A client navigation is an RSC fetch; a full load a plain document GET.
const go = (path: string, opts: { rsc?: boolean; cookie?: string; method?: string } = {}) => {
  const headers: Record<string, string> = { cookie: ["NEXT_LOCALE=pt-BR", opts.cookie].filter(Boolean).join("; ") };
  if (opts.rsc) headers.rsc = "1";
  return middleware(new NextRequest(new URL(path, "https://www.solvymed.com"), { headers, method: opts.method ?? "GET" }));
};
const where = (res: Response) => {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname : null;
};
const cleared = (res: Response) => /sm_practice=;.*Max-Age=0/i.test(res.headers.get("set-cookie") ?? "");

describe("a secretary with no team never gets the dashboard", () => {
  it.each([
    ["/pt-BR/dashboard", false],
    ["/pt-BR/dashboard", true],
    ["/pt-BR/dashboard/patients", true],
    ["/pt-BR/dashboard/schedule", false],
  ])("%s (client navigation: %s) → not part of any team, not the login", async (path, rsc) => {
    db.role = { role: "secretary", invited_by_professional_id: null };
    const res = await go(path, { rsc });
    expect(res.status).toBe(307);
    expect(where(res)).toBe("/pt-BR/auth/not-connected");
  });

  it("English (no prefix) too", async () => {
    db.role = { role: "secretary", invited_by_professional_id: null };
    expect(where(await go("/dashboard", { rsc: true }))).toBe("/auth/not-connected");
  });

  it("the landing page sends her straight there (no dashboard hop): the old loop", async () => {
    db.role = { role: "secretary", invited_by_professional_id: null };
    const res = await go("/pt-BR");
    expect(where(res)).toBe("/pt-BR/auth/not-connected");
    expect(landingDestination(db.role, undefined, "/th")).toBe("/th/auth/not-connected");
  });

  it("a secretary with a team, and a doctor, pass", async () => {
    db.role = { role: "secretary", invited_by_professional_id: DOC_A };
    expect(where(await go("/pt-BR/dashboard", { rsc: true }))).toBeNull();
    db.role = { role: "professional", invited_by_professional_id: null };
    expect(where(await go("/pt-BR/dashboard", { rsc: true }))).toBeNull();
    expect(landingDestination(db.role, undefined, "")).toBe("/dashboard");
  });

  it("a server action (POST) isn't redirected: the database refuses it", async () => {
    db.role = { role: "secretary", invited_by_professional_id: null };
    expect(where(await go("/pt-BR/dashboard", { method: "POST" }))).toBeNull();
  });
});

describe("a stale practice choice (removed by doctor A, still on doctor B)", () => {
  it("is dropped: the same page again, on her primary", async () => {
    // 163's trigger already made B her primary.
    db.role = { role: "secretary", invited_by_professional_id: DOC_B };
    db.practices = [{ professional_id: DOC_B }];
    const res = await go("/pt-BR/dashboard/schedule", { rsc: true, cookie: `sm_practice=${DOC_A}` });
    expect(res.status).toBe(307);
    expect(where(res)).toBe("/pt-BR/dashboard/schedule");
    expect(cleared(res)).toBe(true);
  });

  it("a choice she still serves is kept", async () => {
    db.role = { role: "secretary", invited_by_professional_id: DOC_B };
    db.practices = [{ professional_id: DOC_A }, { professional_id: DOC_B }];
    const res = await go("/pt-BR/dashboard", { cookie: `sm_practice=${DOC_A}` });
    expect(where(res)).toBeNull();
    expect(cleared(res)).toBe(false);
  });

  it("no choice, or \"Todos\": no extra lookup", async () => {
    db.role = { role: "secretary", invited_by_professional_id: DOC_B };
    await go("/pt-BR/dashboard");
    await go("/pt-BR/dashboard", { cookie: "sm_practice=all" });
    expect(db.rpcCalls).toBe(0);
  });

  it("with no team left, the choice goes too", async () => {
    db.role = { role: "secretary", invited_by_professional_id: null };
    const res = await go("/pt-BR/dashboard", { cookie: `sm_practice=${DOC_A}` });
    expect(where(res)).toBe("/pt-BR/auth/not-connected");
    expect(cleared(res)).toBe(true);
  });
});

describe("the open dashboard's re-check key", () => {
  it("changes when a team goes, whatever the order", () => {
    expect(teamAccessKey(DOC_A, [DOC_B, DOC_A])).toBe(teamAccessKey(DOC_A, [DOC_A, DOC_B]));
    expect(teamAccessKey(DOC_B, [DOC_B])).not.toBe(teamAccessKey(DOC_A, [DOC_A, DOC_B]));
    expect(teamAccessKey(null, null)).toBe("none");
    expect(teamAccessKey(DOC_A, null)).not.toBe(teamAccessKey(null, null));
  });
});
