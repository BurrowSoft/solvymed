import { describe, expect, it, vi } from "vitest";
import { withCountryHint } from "@/lib/signupCountry";

// Country first: the links the website builds carry the practice's country
// as ?c=BR|TH (nothing for the default), like the app's #233; a patient's
// language is saved with their country (149's set_my_locale).

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown }[], error: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
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
