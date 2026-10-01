import { describe, expect, it } from "vitest";
import { initialCountryChoice, signupCountryMetadata } from "@/lib/signupCountry";
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

describe("initialCountryChoice (Vitor 1.4.0: Brasil or Thailand only)", () => {
  it("follows the detected country when it's BR or TH", () => {
    expect(initialCountryChoice("BR", "en")).toBe("BR");
    expect(initialCountryChoice("th", "pt-BR")).toBe("TH");
  });

  it("else the page language (pt-BR / th), else no pre-selection", () => {
    expect(initialCountryChoice("PT", "pt-BR")).toBe("BR");
    expect(initialCountryChoice(null, "th")).toBe("TH");
    expect(initialCountryChoice("", "pt-BR")).toBe("BR");
    expect(initialCountryChoice(undefined, "de")).toBeNull();
    expect(initialCountryChoice("US", "en")).toBeNull();
  });
});

describe("practices stored with another country keep the explicit default", () => {
  it("the registry still has a neutral profile and the USD price for them", () => {
    expect(countryProfile("PT").kind).toBe("OTHER");
    expect(countryProfile("ZZ").kind).toBe("OTHER");
    expect(getPlanPrice("ZZ").amount).toBe("US$ 19");
  });
});
