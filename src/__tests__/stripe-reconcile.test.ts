import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The daily Stripe ↔ database check (cf): read-only, compares, reports; 401
// without CRON_SECRET; the support email only after the dry runs.

const h = vi.hoisted(() => ({
  subs: [] as { id: string; status: string; metadata: Record<string, string>; created: number }[],
  rows: [] as unknown[],
  met: false,
}));
vi.mock("@/lib/stripeBilling", () => ({
  stripe: { subscriptions: { list: () => ({ async *[Symbol.asyncIterator]() { for (const s of h.subs) yield s; } }) } },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ order: () => ({ range: async (a: number) => ({ data: a === 0 ? h.rows : [], error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "stripe-reconcile-email" ? h.met : real.conditionMet(id as never)) };
});

import { reconcile, reconcileReport } from "@/lib/stripeReconcile";
import { GET } from "@/app/api/cron/stripe-reconcile/route";

const NOW = Date.UTC(2026, 9, 6, 9, 17) ;
const old = NOW / 1000 - 86400;
const sub = (id: string, status: string, userId: string | null, created = old) => ({ id, status, userId, created });
const row = (id: string, subscription_status: string, subscription_id: string | null, subscription_provider: string | null = "stripe") =>
  ({ id, subscription_status, subscription_id, subscription_provider });

describe("reconcile", () => {
  it("in step: nothing to report", () => {
    expect(reconcile([sub("sub_1", "active", "u1"), sub("sub_2", "canceled", "u2")], [row("u1", "active", "sub_1"), row("u2", "expired", "sub_2")], NOW)).toEqual([]);
  });

  it("each kind of mismatch", () => {
    const m = reconcile(
      [
        sub("sub_pay", "active", "u_pay"),          // paying, row expired
        sub("sub_other", "trialing", "u_other"),    // paying, row linked to another sub
        sub("sub_ghost", "active", "u_ghost"),      // no professional row
        sub("sub_nouser", "active", null),          // no user_id
        sub("sub_life", "active", "u_life"),        // lifetime still billed
        sub("sub_late", "past_due", "u_late"),      // row active but Stripe not charging
        sub("sub_new", "active", "u_new", NOW / 1000 - 600), // 10 min old: grace
      ],
      [
        row("u_pay", "expired", "sub_pay"),
        row("u_other", "active", "sub_older"),
        row("u_life", "lifetime", null, null),
        row("u_late", "active", "sub_late"),
        row("u_gone", "active", "sub_missing"),     // Stripe doesn't know it
        row("u_new", "trial", null, null),
        row("u_manual", "active", null, "manual"),  // not a Stripe row: skipped
      ],
      NOW,
    );
    expect(m.map((x) => `${x.kind}:${"userId" in x ? x.userId : x.subscriptionId}`).sort()).toEqual([
      "access_without_payment:u_gone",
      "access_without_payment:u_late",
      "access_without_payment:u_other",
      "lifetime_still_billed:u_life",
      "no_account:u_ghost",
      "no_user:sub_nouser",
      "paying_without_access:u_other",
      "paying_without_access:u_pay",
    ]);
  });

  it("the report: ids and statuses only", () => {
    const text = reconcileReport(reconcile([sub("sub_pay", "active", "u_pay")], [row("u_pay", "expired", "sub_pay")], NOW), { stripe: 1, rows: 1 }, "dry run");
    expect(text).toContain("Stripe ↔ SolvyMed check (dry run): 1 mismatch(es)");
    expect(text).toContain("PAYING WITHOUT ACCESS: user u_pay, Stripe sub_pay (active); DB status expired, DB subscription sub_pay");
    expect(text).not.toMatch(/@/);
  });
});

describe("GET /api/cron/stripe-reconcile", () => {
  const call = (auth?: string, q = "") =>
    GET(new NextRequest(`https://www.solvymed.com/api/cron/stripe-reconcile${q}`, { headers: auth ? { authorization: auth } : {} }));
  const fetchMock = vi.fn(async () => ({ ok: true }));
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    h.subs = [{ id: "sub_pay", status: "active", metadata: { user_id: "u_pay" }, created: old }];
    h.rows = [row("u_pay", "expired", "sub_pay")];
    h.met = false;
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("without CRON_SECRET: 401 for everyone (harmless until Vitor sets it)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a wrong or missing token: 401", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("before stripe-reconcile-email: a dry run, the report in the response, no email", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const res = await call("Bearer s3cret-value");
    const body = await res.json();
    expect([res.status, body.mode, body.mismatches.length, body.emailed]).toEqual([200, "dry run", 1, false]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("once met: emails support@ on a mismatch, never with ?dry=1, never when in step", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    h.met = true;
    expect((await (await call("Bearer s3cret-value")).json()).emailed).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body).to).toEqual(["support@solvymed.com"]);
    fetchMock.mockClear();
    await call("Bearer s3cret-value", "?dry=1");
    expect(fetchMock).not.toHaveBeenCalled();
    h.rows = [row("u_pay", "active", "sub_pay")];
    await call("Bearer s3cret-value");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
