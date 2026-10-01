import { beforeEach, describe, expect, it, vi } from "vitest";

// e7/38/9a (1 Oct): a proposal the clinic makes on the web is marked
// scheduled_by = 'professional', so neither platform counts it as a
// patient's request (it used to be left null). And only a request (or a
// proposal being replaced) can become one: never a confirmed visit (38).
const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  statusFilter: null as unknown,
  rows: [{ id: "a-1" }] as { id: string }[],
  pushes: 0,
}));
const chain = () => {
  const q: Record<string, unknown> = {};
  q.update = (u: Record<string, unknown>) => { h.updates.push(u); return q; };
  q.select = () => q;
  q.eq = () => q;
  q.in = (_c: string, v: unknown) => { h.statusFilter = v; return q; };
  q.maybeSingle = async () => ({ data: { patient_auth_id: "pat-1", professional_id: "doc-1" }, error: null });
  q.then = (r: (v: { data: { id: string }[]; error: null }) => unknown) => Promise.resolve({ data: h.rows, error: null }).then(r);
  return q;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) }, from: () => chain(), rpc: async () => ({ data: null, error: null }) }),
}));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/pushRecipient", () => ({ patientPushTargets: async () => [{ locale: "pt-BR", tokens: ["t"] }], clinicPushTargets: async () => [] }));
vi.mock("@/lib/push", () => ({ sendExpoPush: async () => { h.pushes++; } }));

import { proposeNewTime } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

beforeEach(() => { h.updates = []; h.statusFilter = null; h.rows = [{ id: "a-1" }]; h.pushes = 0; });

describe("proposeNewTime", () => {
  it("marks the proposal as the clinic's (scheduled_by = 'professional'), only on a request", async () => {
    const r = await proposeNewTime("a-1", "2026-10-10", "10:00", "10:30");
    expect(r).toEqual({ error: null });
    expect(h.updates[0]).toMatchObject({ status: "proposal", scheduled_by: "professional", proposed_date: "2026-10-10" });
    expect(h.statusFilter).toEqual(["tentative", "proposal"]);
    expect(h.pushes).toBe(1);
  });

  it("no longer a request (nothing updated): an error and no notice to the patient", async () => {
    h.rows = [];
    const r = await proposeNewTime("a-1", "2026-10-10", "10:00", "10:30");
    expect(r).toEqual({ error: "not_proposable" });
    expect(h.pushes).toBe(0);
  });
});
