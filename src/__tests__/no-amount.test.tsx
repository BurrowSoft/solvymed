import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The app's #216 on the web (UX 1 Oct): an appointment without an amount is
// not to-receive, is never marked paid until it has one, and the Agenda
// offers "Sem valor · Definir valor".
const h = vi.hoisted(() => ({ stored: null as number | null, updates: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: { payment_amount: h.stored }, error: null });
      q.update = (u: Record<string, unknown>) => { h.updates.push(u); return q; };
      q.then = (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { markPaid, setPaymentAmount } from "@/app/[locale]/(site)/dashboard/(gated)/payments/actions";
import { hasAmount } from "@/lib/paymentRules";

beforeEach(() => { h.stored = null; h.updates.length = 0; });

describe("hasAmount", () => {
  it("only a number above zero", () => {
    expect([150, 0.5].map(hasAmount)).toEqual([true, true]);
    expect([0, -1, null, undefined, NaN].map((v) => hasAmount(v as number))).toEqual([false, false, false, false, false]);
  });
});

describe("markPaid never marks paid without an amount", () => {
  it("an amount given must be above zero", async () => {
    expect(await markPaid("a-1", 0)).toMatchObject({ code: "no_amount" });
    expect(h.updates).toEqual([]);
  });
  it("no amount given: the stored one must be above zero", async () => {
    h.stored = null;
    expect(await markPaid("a-1")).toMatchObject({ code: "no_amount" });
    h.stored = 0;
    expect(await markPaid("a-1")).toMatchObject({ code: "no_amount" });
    expect(h.updates).toEqual([]);
    h.stored = 120;
    expect(await markPaid("a-1")).toEqual({ success: true });
    expect(h.updates).toEqual([{ payment_status: "paid" }]);
  });
  it("with an amount: it's saved together with paid (one update)", async () => {
    expect(await markPaid("a-1", 80)).toEqual({ success: true });
    expect(h.updates).toEqual([{ payment_status: "paid", payment_amount: 80 }]);
  });
});

describe("setPaymentAmount (Definir valor)", () => {
  it("above zero only; it sets just the amount", async () => {
    expect(await setPaymentAmount("a-1", 0)).toMatchObject({ code: "no_amount" });
    expect(await setPaymentAmount("a-1", 90)).toEqual({ success: true });
    expect(h.updates).toEqual([{ payment_amount: 90 }]);
  });
});
