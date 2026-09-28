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
