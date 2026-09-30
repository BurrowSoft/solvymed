import { describe, expect, it, vi } from "vitest";

// A Preview without STRIPE_SECRET_KEY failed the whole build (Next loads
// the routes to collect page data). The client is now built on first use:
// importing the module without a key is fine; only a Stripe call needs it.

const made = vi.hoisted(() => ({ keys: [] as (string | undefined)[] }));
vi.mock("stripe", () => ({
  default: class {
    constructor(key: string | undefined) {
      if (!key) throw new Error("Neither apiKey nor config.authenticator provided");
      made.keys.push(key);
    }
    customers = { list: () => "listed" };
  },
}));

describe("lib/stripeBilling: a lazy client", () => {
  it("imports without a key; builds once, on first use", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.resetModules();
    const m = await import("@/lib/stripeBilling");
    expect(made.keys).toEqual([]);
    expect(() => m.stripe.customers).toThrow(/apiKey/);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect((m.stripe.customers as unknown as { list: () => string }).list()).toBe("listed");
    m.stripe.customers;
    expect(made.keys).toEqual(["sk_test_x"]);
    vi.unstubAllEnvs();
  });
});
