import { describe, expect, it } from "vitest";
import { COUNTRY_STEP, countryFromLanguages, countryStepHref, guessSignupCountry, orderedCountryStep, parseCountryChoice, signupCountryMetadata, type CountryChoice } from "@/lib/signupCountry";
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

describe("country-preselect (Vitor, 2026-10-08): the step's suggested country", () => {
  // [saved cookie, Accept-Language, IP country] → guess. First match wins.
  const rows: [string | null, string | null, string | null, CountryChoice | null][] = [
    // precedence: saved > languages > IP > none
    ["TH", "pt-BR", "BR", "TH"],
    [null, "pt-BR,pt;q=0.9", "TH", "BR"],
    [null, "th-TH,th;q=0.9", "BR", "TH"],
    [null, "en-US,en;q=0.9", "TH", "TH"],
    [null, "en-US,en;q=0.9", "US", null],
    [null, null, null, null],
    // first match in priority order, not just the first entry (b2)
    [null, "en-US,en;q=0.9,pt-BR;q=0.8", null, "BR"],
    [null, "en;q=0.5,th;q=0.8", null, "TH"],
    // a region counts in any language
    [null, "en-TH", "BR", "TH"],
    [null, "en-BR", "TH", "BR"],
    // bare th counts; bare pt and pt-PT don't (Portugal), so the IP decides
    [null, "th", null, "TH"],
    [null, "pt", "TH", "TH"],
    [null, "pt-PT,pt;q=0.9", null, null],
    // unsupported countries fall through
    [null, "es-AR,es;q=0.9", "BR", "BR"],
    ["US", "de-DE", "PT", null],
    // q=0 means "not this language"
    [null, "pt-BR;q=0,en", "TH", "TH"],
  ];
  it.each(rows)("saved %s · Accept-Language %s · IP %s → %s", (saved, acceptLanguage, ipCountry, expected) => {
    expect(guessSignupCountry({ saved, acceptLanguage, ipCountry })).toBe(expected);
  });

  it("the guess goes first; no guess keeps the listed order (Brasil first)", () => {
    expect(orderedCountryStep("TH").map((c) => c.code)).toEqual(["TH", "BR"]);
    expect(orderedCountryStep("BR").map((c) => c.code)).toEqual(["BR", "TH"]);
    expect(orderedCountryStep(null).map((c) => c.code)).toEqual(["BR", "TH"]);
  });

  it("is driven by COUNTRY_STEP: only its countries and their bare languages count", () => {
    expect(COUNTRY_STEP.map((c) => [c.code, c.bareLanguage])).toEqual([["BR", null], ["TH", "th"]]);
    expect(countryFromLanguages("zh-Hant-TW,th-US")).toBeNull();
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
