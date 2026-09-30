import { beforeEach, describe, expect, it, vi } from "vitest";

// The paywall for the gated pages' server actions (lib/activeAccess): the
// layout's rule (get_effective_subscription + isAccessAllowed), fail-open on
// no row or a failed lookup, and a locked practice's action writes nothing.

const DAY = 24 * 60 * 60 * 1000;
const h = vi.hoisted(() => ({
  sub: null as Record<string, unknown> | null,
  rpcError: null as unknown,
  role: { role: "professional", invited_by_professional_id: null } as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string) => (fn === "get_effective_subscription"
      ? { data: h.rpcError ? null : h.sub ? [h.sub] : [], error: h.rpcError }
      : { data: null, error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.update = (row: Record<string, unknown>) => { h.updates.push(row); return q; };
      q.maybeSingle = async () => ({ data: table === "user_roles" ? h.role : null, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
      return q;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getActiveProfId, isActiveProfessional, isLockedOut } from "@/lib/activeAccess";
import { markPaid } from "@/app/[locale]/(site)/dashboard/(gated)/payments/actions";

type Db = Parameters<typeof isLockedOut>[0];
const db = () => client() as unknown as Db;

beforeEach(() => {
  h.sub = null; h.rpcError = null; h.updates = [];
  h.role = { role: "professional", invited_by_professional_id: null };
});

describe("activeAccess", () => {
  it("an ended trial or an expired plan is locked out", async () => {
    h.sub = { subscription_status: "trial", trial_ends_at: new Date(Date.now() - DAY).toISOString(), current_period_end: null };
    expect(await isLockedOut(db(), "doc-1")).toBe(true);
    expect(await getActiveProfId(db(), "doc-1")).toBeNull();
    expect(await isActiveProfessional(db(), "doc-1")).toBe(false);
    h.sub = { subscription_status: "expired", trial_ends_at: null, current_period_end: null };
    expect(await isLockedOut(db(), "doc-1")).toBe(true);
  });

  it("a running trial, an active plan, no row or a failed lookup is not (the layout's fail-open)", async () => {
    h.sub = { subscription_status: "trial", trial_ends_at: new Date(Date.now() + DAY).toISOString(), current_period_end: null };
    expect(await getActiveProfId(db(), "doc-1")).toBe("doc-1");
    expect(await isActiveProfessional(db(), "doc-1")).toBe(true);
    h.sub = { subscription_status: "active", trial_ends_at: null, current_period_end: new Date(Date.now() + DAY).toISOString() };
    expect(await isLockedOut(db(), "doc-1")).toBe(false);
    h.sub = null;
    expect(await isLockedOut(db(), "doc-1")).toBe(false);
    h.rpcError = { message: "boom" };
    expect(await isLockedOut(db(), "doc-1")).toBe(false);
  });

  it("a secretary resolves to her doctor, and is locked with the doctor's plan", async () => {
    h.role = { role: "secretary", invited_by_professional_id: "doc-9" };
    expect(await getActiveProfId(db(), "sec-1")).toBe("doc-9");
    h.sub = { subscription_status: "expired", trial_ends_at: null, current_period_end: null };
    expect(await getActiveProfId(db(), "sec-1")).toBeNull();
  });

  it("a locked practice's action (Marcar pago) writes nothing", async () => {
    h.sub = { subscription_status: "expired", trial_ends_at: null, current_period_end: null };
    const r = await markPaid("abcdef12-1111-4222-8333-444455556666", 100);
    expect(r).not.toHaveProperty("success", true);
    expect(h.updates).toEqual([]);
  });
});
