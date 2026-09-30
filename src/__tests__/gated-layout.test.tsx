import { beforeEach, describe, expect, it, vi } from "vitest";

// A locked doctor (ended trial, failed renewal) still reaches Settings; the
// other dashboard sections sit behind (gated)/layout.tsx (UX: their data
// is theirs, a paywall never holds it hostage).

const h = vi.hoisted(() => ({ user: { id: "d1" } as { id: string } | null, sub: null as unknown, redirects: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { h.redirects.push(to); throw new Error("NEXT_REDIRECT " + to); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async () => ({ data: h.sub ? [h.sub] : [], error: null }),
  }),
}));

import GatedLayout from "@/app/[locale]/(site)/dashboard/(gated)/layout";

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const run = () => GatedLayout({ children: "page", params: Promise.resolve({ locale: "pt-BR" }) });

beforeEach(() => { h.user = { id: "d1" }; h.sub = null; h.redirects = []; });

describe("(gated) dashboard layout", () => {
  it("a running trial or an active plan passes", async () => {
    h.sub = { subscription_status: "trial", trial_ends_at: future, current_period_end: null, subscription_provider: null, subscription_id: null };
    await expect(run()).resolves.toBeTruthy();
    h.sub = { subscription_status: "active", trial_ends_at: null, current_period_end: future, subscription_provider: "stripe", subscription_id: "sub_1" };
    await expect(run()).resolves.toBeTruthy();
    expect(h.redirects).toEqual([]);
  });

  it("a locked doctor goes to the paywall (Settings is outside this group)", async () => {
    h.sub = { subscription_status: "trial", trial_ends_at: past, current_period_end: null, subscription_provider: null, subscription_id: null };
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.redirects).toEqual(["/pt-BR/subscribe"]);
  });

  it("signed out goes to login", async () => {
    h.user = null;
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.redirects).toEqual(["/pt-BR/auth/login"]);
  });
});
