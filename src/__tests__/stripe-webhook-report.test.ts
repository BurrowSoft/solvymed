import { beforeEach, describe, expect, it, vi } from "vitest";

// Stripe webhook failures the route can see reach Sentry, with only the
// reason and the event's type and id (never the payload or the customer).

const h = vi.hoisted(() => ({
  captured: [] as { message: string; opts: { tags: Record<string, string> } }[],
  constructEvent: (() => ({})) as (body: string) => unknown,
  retrieve: (async () => ({})) as (id: string) => Promise<unknown>,
  rows: [{ id: "u-1" }] as unknown[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, opts: { tags: Record<string, string> }) => { h.captured.push({ message, opts }); },
  flush: async () => true,
}));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: (body: string) => h.constructEvent(body) };
    subscriptions = { retrieve: (id: string) => h.retrieve(id) };
  },
}));
vi.mock("@supabase/supabase-js", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "update", "eq", "neq", "or"]) q[m] = () => q;
  q.select = async () => ({ data: h.rows, error: null });
  return { createClient: () => q };
});
// The route's Stripe client now comes from lib/stripeBilling (built lazily).
vi.mock("@/lib/stripeBilling", () => ({
  retrieveSubscriptionOrNull: async () => null,
  stripe: {
    webhooks: { constructEvent: (body: string) => h.constructEvent(body) },
    subscriptions: { retrieve: (id: string) => h.retrieve(id) },
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const req = () => new Request("https://www.solvymed.com/api/webhooks/stripe", {
  method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: '{"secret":"cus_123 jane@example.com"}',
}) as unknown as Parameters<typeof POST>[0];

const subEvent = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };

beforeEach(() => {
  h.captured = [];
  h.rows = [{ id: "u-1" }];
  h.constructEvent = () => subEvent;
  h.retrieve = async () => ({ id: "sub_1", status: "active", metadata: { user_id: "u-1" }, items: { data: [{ current_period_end: 2_000_000_000 }] } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Stripe webhook → Sentry", () => {
  it("reports a bad signature, with nothing from the body", async () => {
    h.constructEvent = () => { throw new Error("bad sig"); };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(h.captured).toHaveLength(1);
    expect(h.captured[0].message).toBe("Stripe webhook: bad_signature");
    expect(JSON.stringify(h.captured)).not.toMatch(/cus_123|jane@/);
  });

  it("reports a sync failure (Stripe will retry) with the event type and id only", async () => {
    h.retrieve = async () => { throw new Error("stripe down"); };
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(h.captured).toEqual([{
      message: "Stripe webhook: sync_failed",
      opts: expect.objectContaining({ tags: { stripe_webhook_failure: "sync_failed", stripe_event_type: "customer.subscription.updated", stripe_event_id: "evt_1" } }),
    }]);
  });

  it("reports an active subscription that matched no row", async () => {
    h.rows = [];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.captured.map((c) => c.message)).toEqual(["Stripe webhook: no_professional_row"]);
  });

  it("stays quiet when it works", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.captured).toEqual([]);
  });
});
