import { describe, it, expect } from "vitest";
import { canonicalLocalePath, localeFromAcceptLanguage, matchLocaleTag, pickLocale } from "@/lib/localeDetect";

const L = ["en", "th", "es", "ru", "pt-BR", "fr", "ja", "zh", "zh-TW", "ar", "de", "id", "ko", "it", "vi"] as const;

describe("matchLocaleTag", () => {
  it("maps any Portuguese to pt-BR", () => {
    expect(matchLocaleTag("pt-BR", L)).toBe("pt-BR");
    expect(matchLocaleTag("pt-PT", L)).toBe("pt-BR");
    expect(matchLocaleTag("pt", L)).toBe("pt-BR");
  });
  it("splits Chinese by script or region", () => {
    expect(matchLocaleTag("zh-TW", L)).toBe("zh-TW");
    expect(matchLocaleTag("zh-Hant-HK", L)).toBe("zh-TW");
    expect(matchLocaleTag("zh-CN", L)).toBe("zh");
    expect(matchLocaleTag("zh", L)).toBe("zh");
  });
  it("uses the base language, case-insensitively", () => {
    expect(matchLocaleTag("es-MX", L)).toBe("es");
    expect(matchLocaleTag("EN-us", L)).toBe("en");
    expect(matchLocaleTag("nl-NL", L)).toBeNull();
    expect(matchLocaleTag("*", L)).toBeNull();
  });
});

describe("localeFromAcceptLanguage", () => {
  it("takes the highest-q supported language", () => {
    expect(localeFromAcceptLanguage("nl-NL,nl;q=0.9,pt-BR;q=0.8,en;q=0.7", L)).toBe("pt-BR");
    expect(localeFromAcceptLanguage("en;q=0.5, th;q=0.9", L)).toBe("th");
  });
  it("ignores q=0 and returns null when nothing matches", () => {
    expect(localeFromAcceptLanguage("pt-BR;q=0, nl", L)).toBeNull();
    expect(localeFromAcceptLanguage("", L)).toBeNull();
    expect(localeFromAcceptLanguage(null, L)).toBeNull();
  });
});

describe("pickLocale (browser language first, country as fallback)", () => {
  it("a Brazilian browser in Thailand gets Portuguese", () => {
    expect(pickLocale({ acceptLanguage: "pt-BR,pt;q=0.9", country: "TH", supported: L, defaultLocale: "en" })).toBe("pt-BR");
  });
  it("a Thai browser in Brazil gets Thai", () => {
    expect(pickLocale({ acceptLanguage: "th-TH,th;q=0.9", country: "BR", supported: L, defaultLocale: "en" })).toBe("th");
  });
  it("an unsupported browser language falls back to the country", () => {
    expect(pickLocale({ acceptLanguage: "nl-NL", country: "BR", supported: L, defaultLocale: "en" })).toBe("pt-BR");
  });
  it("no signal at all gives the default", () => {
    expect(pickLocale({ acceptLanguage: null, country: null, supported: L, defaultLocale: "en" })).toBe("en");
    expect(pickLocale({ acceptLanguage: "nl", country: "NL", supported: L, defaultLocale: "en" })).toBe("en");
  });
});

describe("canonicalLocalePath", () => {
  it("aliases /pt and odd casing to the real prefix", () => {
    expect(canonicalLocalePath("/pt/join/ABC123", L)).toBe("/pt-BR/join/ABC123");
    expect(canonicalLocalePath("/pt", L)).toBe("/pt-BR");
    expect(canonicalLocalePath("/pt-br/auth/login", L)).toBe("/pt-BR/auth/login");
    expect(canonicalLocalePath("/zh-tw", L)).toBe("/zh-TW");
  });
  it("leaves real locales and ordinary paths alone", () => {
    expect(canonicalLocalePath("/pt-BR/dashboard", L)).toBeNull();
    expect(canonicalLocalePath("/dashboard", L)).toBeNull();
    expect(canonicalLocalePath("/", L)).toBeNull();
    expect(canonicalLocalePath("/privacy", L)).toBeNull();
  });
});
