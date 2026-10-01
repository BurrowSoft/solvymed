import { describe, expect, it } from "vitest";
import { isPublicLocale, publicLocales } from "@/lib/publicLocales";
import { pickLocale } from "@/lib/localeDetect";

describe("publicLocales (Thai hidden until the Thai release)", () => {
  it("leaves th out unless enabled", () => {
    expect(publicLocales(false)).not.toContain("th");
    expect(publicLocales(false)).toContain("pt-BR");
    expect(publicLocales(true)).toContain("th");
    expect(isPublicLocale("th", false)).toBe(false);
    expect(isPublicLocale("en", false)).toBe(true);
  });

  it("first-visit detection never picks th while hidden", () => {
    const hidden = publicLocales(false);
    expect(pickLocale({ acceptLanguage: "th-TH,th;q=0.9", country: "TH", supported: hidden, defaultLocale: "en" })).not.toBe("th");
    expect(pickLocale({ acceptLanguage: "th-TH,th;q=0.9", country: "TH", supported: publicLocales(true), defaultLocale: "en" })).toBe("th");
  });
});

describe("country first (Vitor, 2026-10-01): en / pt-BR / th only", () => {
  it("offers only the two countries' languages and English", async () => {
    const { isRetiredLocale } = await import("@/lib/publicLocales");
    expect(publicLocales(true)).toEqual(expect.arrayContaining(["en", "pt-BR", "th"]));
    expect(publicLocales(true)).toHaveLength(3);
    for (const l of ["fr", "de", "it", "es", "ja", "zh-TW"]) {
      expect(isPublicLocale(l, true)).toBe(false);
      expect(isRetiredLocale(l)).toBe(true);
    }
    expect(isRetiredLocale("th")).toBe(false);
    expect(isRetiredLocale("pt-BR")).toBe(false);
  });

  it("detection never lands on a retired language", () => {
    expect(pickLocale({ acceptLanguage: "de-DE,de;q=0.9", country: "DE", supported: publicLocales(true), defaultLocale: "en" })).toBe("en");
  });
});
