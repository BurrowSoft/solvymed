import { describe, expect, it } from "vitest";
import { getPlanPrice } from "@/lib/subscription";

describe("getPlanPrice (by practice country, TH-5)", () => {
  it("prices Brazil, Thailand and everywhere else", () => {
    expect(getPlanPrice("BR")).toEqual({ amount: "R$ 89", currency: "brl", unitAmount: 8900 });
    expect(getPlanPrice("TH")).toEqual({ amount: "฿690", currency: "thb", unitAmount: 69000 });
    for (const c of ["PT", "US", "ZZ"]) expect(getPlanPrice(c)).toEqual({ amount: "US$ 19", currency: "usd", unitAmount: 1900 });
  });

  it("is Brazil for a practice without a country yet (before migration 110)", () => {
    expect(getPlanPrice(null).currency).toBe("brl");
    expect(getPlanPrice(undefined).currency).toBe("brl");
  });

  it("takes a country code, not a locale", () => {
    // A locale like "pt-BR" isn't a country code, so it falls back to BR;
    // callers pass the practice's country (lib/practiceCountry).
    expect(getPlanPrice("pt-BR").currency).toBe("brl");
    expect(getPlanPrice("en-US").currency).toBe("brl");
  });
});
