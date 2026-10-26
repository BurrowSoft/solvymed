import { afterEach, describe, expect, it, vi } from "vitest";

// The demo's cookie-free counters (238): the client helper never throws, never waits
// longer than its cap, and maps each sign-up click / value moment to its counter.

const h = vi.hoisted(() => ({ calls: [] as unknown[], rpc: (async () => ({ data: null, error: null })) as (...a: unknown[]) => Promise<unknown> }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: (...a: unknown[]) => { h.calls.push(a); return h.rpc(...a); } }),
}));

import { VALUE_METRIC, demoCount, setDemoCounting, signupClickMetric } from "@/lib/demoMetrics";

afterEach(() => {
  h.calls = [];
  h.rpc = async () => ({ data: null, error: null });
  vi.useRealTimers();
});

describe("demoCount", () => {
  it("counts nothing until the server says Production (cf, #615: previews share the database)", async () => {
    setDemoCounting(false);
    await demoCount("tour_step_1");
    expect(h.calls).toEqual([]);
    setDemoCounting(true);
  });

  it("calls demo_count with the metric (and the page's country/language for signin)", async () => {
    await demoCount("tour_step_2");
    await demoCount("signin", { country: "TH", locale: "th" });
    expect(h.calls).toEqual([
      ["demo_count", { p_metric: "tour_step_2" }],
      ["demo_count", { p_metric: "signin", p_country: "TH", p_locale: "th" }],
    ]);
  });

  it("never throws, and gives up after 1.5 s so leaving the demo is never stuck", async () => {
    h.rpc = async () => { throw new Error("offline"); };
    await expect(demoCount("leave")).resolves.toBeUndefined();
    vi.useFakeTimers();
    h.rpc = () => new Promise(() => {});
    const p = demoCount("leave");
    vi.advanceTimersByTime(1500);
    await expect(p).resolves.toBeUndefined();
  });
});

describe("the counters' names", () => {
  it("sign-up clicks by where they came from", () => {
    expect(signupClickMetric("bar")).toBe("signup_click_bar");
    expect(signupClickMetric("blocked")).toBe("signup_click_blocked");
    expect(signupClickMetric("ai_quota")).toBe("signup_click_ai_quota");
    expect(signupClickMetric("tour")).toBe("signup_click_tour");
    expect(signupClickMetric("sheet_prescription")).toBe("signup_click_value");
    expect(signupClickMetric("somewhere")).toBeNull();
  });

  it("the value moments", () => {
    expect(VALUE_METRIC).toEqual({ prescription: "value_rx", appointment: "value_booking", solvyai: "value_ai" });
  });
});

describe("the server's counts", () => {
  it("only on Production (previews and tests share the database)", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const created: unknown[] = [];
    vi.doMock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => { created.push(a); return { rpc: async () => ({ error: null }) }; } }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    const { demoCountServer } = await import("@/lib/demoMetricsServer");
    vi.stubEnv("VERCEL_ENV", "preview");
    await demoCountServer("page_load", "BR", "pt-BR");
    expect(created).toHaveLength(0);
    vi.stubEnv("VERCEL_ENV", "production");
    await demoCountServer("page_load", "BR", "pt-BR");
    expect(created).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});
