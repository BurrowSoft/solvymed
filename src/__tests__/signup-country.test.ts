import { describe, expect, it } from "vitest";
import { countryToStore, initialCountryChoice } from "@/lib/signupCountry";

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
