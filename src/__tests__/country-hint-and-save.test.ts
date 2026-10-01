import { describe, expect, it, vi } from "vitest";
import { withCountryHint } from "@/lib/signupCountry";

// Country first: the links the website builds carry the practice's country
// as ?c=BR|TH (nothing for the default), like the app's #233; a patient's
// language is saved with their country (149's set_my_locale).

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown }[], error: null as unknown, createdAt: new Date().toISOString() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", created_at: h.createdAt } } }) },
    rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return { error: h.error }; },
  }),
}));

import { saveMyLocale } from "@/app/[locale]/(site)/dashboard/locale-actions";

describe("withCountryHint", () => {
  it("adds ?c= for Brazil and Thailand, nothing for the default", () => {
    expect(withCountryHint("https://www.solvymed.com/join/ABC123", "BR")).toBe("https://www.solvymed.com/join/ABC123?c=BR");
    expect(withCountryHint("/auth/signup?join=ABC123", "TH")).toBe("/auth/signup?join=ABC123&c=TH");
    expect(withCountryHint("/join/ABC123", "US")).toBe("/join/ABC123");
    expect(withCountryHint("/join/ABC123", "ZZ")).toBe("/join/ABC123");
    expect(withCountryHint("/join/ABC123", null)).toBe("/join/ABC123");
  });
});

describe("saveMyLocale (149)", () => {
  it("sends the country only when it's BR or TH; the 1-arg call is unchanged", async () => {
    h.calls = [];
    await saveMyLocale("th", "TH");
    await saveMyLocale("pt-BR");
    await saveMyLocale("en", "US");
    expect(h.calls).toEqual([
      { fn: "set_my_locale", args: { p_locale: "th", p_country: "TH" } },
      { fn: "set_my_locale", args: { p_locale: "pt-BR" } },
      { fn: "set_my_locale", args: { p_locale: "en" } },
    ]);
  });
});

describe("the signup pick belongs to a new account only (9a)", () => {
  it("an account older than the cookie's 14 days never takes the pick", async () => {
    const { pickApplies } = await import("@/lib/signupCountry");
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(pickApplies("2026-09-30T12:00:00Z", now)).toBe(true);
    expect(pickApplies("2026-09-01T12:00:00Z", now)).toBe(false);
    expect(pickApplies(null, now)).toBe(false);
    h.calls = [];
    h.createdAt = "2025-01-01T00:00:00Z";
    await saveMyLocale("th", "TH");
    expect(h.calls).toEqual([{ fn: "set_my_locale", args: { p_locale: "th" } }]);
  });
});
