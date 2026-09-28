import { describe, expect, it } from "vitest";
import { countryToStore, initialCountryChoice, signupCountryMetadata } from "@/lib/signupCountry";

describe("signupCountryMetadata", () => {
  it("sends nothing before the Thai release (the database default, BR, applies)", () => {
    expect(signupCountryMetadata("OTHER", "PT", "Europe/Lisbon", false)).toEqual({});
    expect(signupCountryMetadata("TH", "TH", "Asia/Bangkok", false)).toEqual({});
  });

  it("sends the country and time zone from the Thai release on", () => {
    expect(signupCountryMetadata("TH", "TH", "Asia/Bangkok", true)).toEqual({ country: "TH", time_zone: "Asia/Bangkok" });
    expect(signupCountryMetadata("OTHER", "pt", "Europe/Lisbon", true)).toEqual({ country: "PT", time_zone: "Europe/Lisbon" });
    expect(signupCountryMetadata("BR", null, null, true)).toEqual({ country: "BR", time_zone: null });
  });
});

describe("initialCountryChoice", () => {
  it("follows the detected country", () => {
    expect(initialCountryChoice("BR", "en")).toBe("BR");
    expect(initialCountryChoice("th", "pt-BR")).toBe("TH");
    expect(initialCountryChoice("PT", "pt-BR")).toBe("OTHER");
  });

  it("falls back to the page language, then Brasil", () => {
    expect(initialCountryChoice(null, "th")).toBe("TH");
    expect(initialCountryChoice("", "pt-BR")).toBe("BR");
    expect(initialCountryChoice(undefined, "de")).toBe("BR");
  });
});

describe("countryToStore", () => {
  it("stores BR and TH as picked", () => {
    expect(countryToStore("BR", "PT")).toBe("BR");
    expect(countryToStore("TH", null)).toBe("TH");
  });

  it("stores the detected country for Other, else ZZ", () => {
    expect(countryToStore("OTHER", "pt")).toBe("PT");
    expect(countryToStore("OTHER", null)).toBe("ZZ");
    expect(countryToStore("OTHER", "BR")).toBe("ZZ");
    expect(countryToStore("OTHER", "TH")).toBe("ZZ");
    expect(countryToStore("OTHER", "Brazil")).toBe("ZZ");
  });
});
