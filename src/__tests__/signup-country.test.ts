import { describe, expect, it } from "vitest";
import { countryToStore, initialCountryChoice } from "@/lib/signupCountry";

describe("initialCountryChoice", () => {
  it("follows the detected country (Thailand offered)", () => {
    expect(initialCountryChoice("BR", "en", true)).toBe("BR");
    expect(initialCountryChoice("th", "pt-BR", true)).toBe("TH");
    expect(initialCountryChoice("PT", "pt-BR", true)).toBe("OTHER");
  });

  it("falls back to the page language, then Brasil (Thailand offered)", () => {
    expect(initialCountryChoice(null, "th", true)).toBe("TH");
    expect(initialCountryChoice("", "pt-BR", true)).toBe("BR");
    expect(initialCountryChoice(undefined, "de", true)).toBe("BR");
  });

  it("never pre-selects Thailand while it isn't offered (before the Thai release)", () => {
    expect(initialCountryChoice("TH", "en", false)).toBe("OTHER");
    expect(initialCountryChoice(null, "th", false)).toBe("OTHER");
    expect(initialCountryChoice("BR", "th", false)).toBe("BR");
    expect(initialCountryChoice("PT", "en", false)).toBe("OTHER");
  });
});

describe("countryToStore", () => {
  it("stores BR and TH as picked", () => {
    expect(countryToStore("BR", "PT")).toBe("BR");
    expect(countryToStore("TH", null)).toBe("TH");
  });

  it("stores the detected country for Other, else ZZ (a Thai visitor while Thailand is hidden → ZZ)", () => {
    expect(countryToStore("OTHER", "pt")).toBe("PT");
    expect(countryToStore("OTHER", null)).toBe("ZZ");
    expect(countryToStore("OTHER", "BR")).toBe("ZZ");
    expect(countryToStore("OTHER", "TH")).toBe("ZZ");
    expect(countryToStore("OTHER", "Brazil")).toBe("ZZ");
  });
});
