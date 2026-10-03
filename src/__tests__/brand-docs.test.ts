import { describe, expect, it } from "vitest";
import { brandSigner, brandedDocTemplate, type Brand } from "@/lib/brand";
import { DEFAULT_TEMPLATE } from "@/lib/prescriptionDoc";
import { contrastRatio } from "@/lib/readableAccent";

// The brand on printed documents (1.5.0, behind the flag): only what the
// doctor set overrides the template; the colour is readable on white paper.

const brand = (over: Partial<Brand> = {}): Brand => ({
  displayName: "Ana Souza", title: "Dra.", specialty: "", registrationLine: "CRM 1/SP", accentColor: null,
  logoSquareUrl: null, logoWideUrl: null, photoUrl: null,
  own: { logo_square: false, logo_wide: false, photo: false }, ...over,
});
const TEMPLATE = { ...DEFAULT_TEMPLATE, primaryColor: "#123456", accentColor: "#abcdef", logoUrl: "https://x/old-logo.png" };

describe("brandedDocTemplate", () => {
  it("no brand: the template unchanged", () => {
    expect(brandedDocTemplate(TEMPLATE, null)).toEqual(TEMPLATE);
  });

  it("no accent chosen and no own logo: the template's colours and logo stay", () => {
    expect(brandedDocTemplate(TEMPLATE, brand())).toEqual(TEMPLATE);
  });

  it("a chosen accent, darkened until readable on white (it prints in black and white too)", () => {
    const t = brandedDocTemplate(TEMPLATE, brand({ accentColor: "#ffff00" }));
    expect(t.primaryColor).toBe("#7a7a00");
    expect(contrastRatio(t.primaryColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(t.accentColor).toBe("#7a7a00");
  });

  it("the doctor's own wide logo, else the square one; never a legacy image", () => {
    const urls = { logoSquareUrl: "https://cdn/sq.png", logoWideUrl: "https://cdn/wide.png" };
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls, own: { logo_square: true, logo_wide: true, photo: false } })).logoUrl).toBe("https://cdn/wide.png");
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls, own: { logo_square: true, logo_wide: false, photo: false } })).logoUrl).toBe("https://cdn/sq.png");
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls, own: { logo_square: false, logo_wide: false, photo: false } })).logoUrl).toBe("https://x/old-logo.png");
  });
});

describe("brandSigner", () => {
  it("the brand's title + name and registration line", () => {
    expect(brandSigner(brand(), { name: "Ana", registration: null })).toEqual({ name: "Dra. Ana Souza", registration: "CRM 1/SP" });
  });

  it("no brand, or empty fields: the profile's own", () => {
    expect(brandSigner(null, { name: "Ana", registration: "CRM 9" })).toEqual({ name: "Ana", registration: "CRM 9" });
    expect(brandSigner(brand({ title: "", displayName: "", registrationLine: "" }), { name: "Ana", registration: "CRM 9" })).toEqual({ name: "Ana", registration: "CRM 9" });
  });
});
