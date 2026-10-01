import { describe, expect, it } from "vitest";
import { COUNTRY_STEP, countryStepHref, parseCountryChoice, signupCountryMetadata } from "@/lib/signupCountry";
import { countryProfile } from "@/lib/country";
import { getPlanPrice } from "@/lib/subscription";

describe("signupCountryMetadata", () => {
  it("sends nothing before the Thai release (the database default, BR, applies)", () => {
    expect(signupCountryMetadata("BR", "America/Sao_Paulo", false)).toEqual({});
    expect(signupCountryMetadata("TH", "Asia/Bangkok", false)).toEqual({});
  });

  it("sends the country and time zone from the Thai release on", () => {
    expect(signupCountryMetadata("TH", "Asia/Bangkok", true)).toEqual({ country: "TH", time_zone: "Asia/Bangkok" });
    expect(signupCountryMetadata("BR", null, true)).toEqual({ country: "BR", time_zone: null });
  });
});

describe("country first (Vitor, 2026-10-01): the signup's first step", () => {
  it("offers Brasil and Thailand only, each continuing in its language", () => {
    expect(COUNTRY_STEP.map((c) => [c.code, c.locale])).toEqual([["BR", "pt-BR"], ["TH", "th"]]);
  });

  it("reads ?c= back; anything else is no choice (the step again)", () => {
    expect(parseCountryChoice("br")).toBe("BR");
    expect(parseCountryChoice("TH")).toBe("TH");
    expect(parseCountryChoice("OTHER")).toBeNull();
    expect(parseCountryChoice("US")).toBeNull();
    expect(parseCountryChoice(null)).toBeNull();
  });

  it("the choice and the back arrow keep the rest of the query", () => {
    expect(countryStepHref("BR", "pt-BR", new URLSearchParams("role=x"))).toBe("/pt-BR/auth/signup?role=x&c=BR");
    expect(countryStepHref("TH", "en", new URLSearchParams())).toBe("/auth/signup?c=TH");
    expect(countryStepHref(null, "th", new URLSearchParams("c=TH&a=1"))).toBe("/th/auth/signup?a=1");
  });
});

describe("practices stored with another country keep the explicit default", () => {
  it("the registry still has a neutral profile (English only) and the USD price for them", () => {
    expect(countryProfile("PT").kind).toBe("OTHER");
    expect(countryProfile("ZZ").languages).toEqual(["en"]);
    expect(getPlanPrice("ZZ").amount).toBe("US$ 19");
  });

  it("each country offers its language and English", () => {
    expect(countryProfile("BR").languages).toEqual(["pt-BR", "en"]);
    expect(countryProfile("TH").languages).toEqual(["th", "en"]);
  });
});
