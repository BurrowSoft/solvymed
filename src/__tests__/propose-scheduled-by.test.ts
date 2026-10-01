import { describe, expect, it, vi } from "vitest";

// e7/38/9a (1 Oct): a proposal the clinic makes on the web is marked
// scheduled_by = 'professional', so neither platform counts it as a
// patient's request (it used to be left null).
const updates: Record<string, unknown>[] = [];
const chain = () => {
  const q: Record<string, unknown> = {};
  q.update = (u: Record<string, unknown>) => { updates.push(u); return q; };
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r);
  return q;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) }, from: () => chain(), rpc: async () => ({ data: null, error: null }) }),
}));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({ sendExpoPush: async () => {} }));

import { proposeNewTime } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";

describe("proposeNewTime", () => {
  it("marks the proposal as the clinic's (scheduled_by = 'professional')", async () => {
    const r = await proposeNewTime("a-1", "2026-10-10", "10:00", "10:30");
    expect(r).toEqual({ error: null });
    expect(updates[0]).toMatchObject({ status: "proposal", scheduled_by: "professional", proposed_date: "2026-10-10" });
  });
});
