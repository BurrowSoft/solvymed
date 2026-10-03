import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { brandedDocTemplate, docBrand, type Brand } from "@/lib/brand";
import { DEFAULT_TEMPLATE } from "@/lib/prescriptionDoc";
import { contrastRatio } from "@/lib/readableAccent";
import { DocBrandHeader } from "@/components/DocBrandHeader";

// The brand on printed documents (1.5.0, behind the flag), as the app's
// PDFs (#318): only after the doctor SAVED My brand (e7: otherwise exactly
// as today); then a chosen accent readable on white (none: the template's
// colour as is), the logo own wide → own square → the template's, and a
// header block. The signature stays the legal identity.

const brand = (over: Partial<Brand> = {}): Brand => ({
  displayName: "Ana Souza", title: "Dra.", specialty: "Dermatologia", registrationLine: "CRM 1/SP", accentColor: null,
  logoSquareUrl: null, logoWideUrl: null, photoUrl: null,
  own: { logo_square: false, logo_wide: false, photo: false }, saved: true, ...over,
});
const TEMPLATE = { ...DEFAULT_TEMPLATE, primaryColor: "#7dd3fc", accentColor: "#abcdef", logoUrl: "https://x/old-logo.png" };

describe("brandedDocTemplate", () => {
  it("no brand, or not saved: the template exactly as today", () => {
    expect(brandedDocTemplate(TEMPLATE, null)).toEqual(TEMPLATE);
    expect(brandedDocTemplate(TEMPLATE, brand({ saved: false, accentColor: "#ff0000" }))).toEqual(TEMPLATE);
    expect(docBrand(TEMPLATE, brand({ saved: false }))).toBeNull();
  });

  it("a chosen accent, darkened until readable on white", () => {
    const t = brandedDocTemplate(TEMPLATE, brand({ accentColor: "#ffff00" }));
    expect(t.primaryColor).toBe("#7a7a00");
    expect(contrastRatio(t.primaryColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("a saved brand without an accent: the template's colours exactly as they are", () => {
    const t = brandedDocTemplate(TEMPLATE, brand());
    expect(t.primaryColor).toBe(TEMPLATE.primaryColor);
    expect(t.accentColor).toBe(TEMPLATE.accentColor);
  });

  it("the logo: own wide, else own square, else the template's (never another legacy image)", () => {
    const urls = { logoSquareUrl: "https://cdn/sq.png", logoWideUrl: "https://cdn/wide.png" };
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls, own: { logo_square: true, logo_wide: true, photo: false } })).logoUrl).toBe("https://cdn/wide.png");
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls, own: { logo_square: true, logo_wide: false, photo: false } })).logoUrl).toBe("https://cdn/sq.png");
    expect(brandedDocTemplate(TEMPLATE, brand({ ...urls })).logoUrl).toBe("https://x/old-logo.png");
  });
});

describe("the header block", () => {
  it("the name, specialty, registration line; initials in the colour when there's no logo", () => {
    const b = docBrand({ ...TEMPLATE, logoUrl: null }, brand({ accentColor: "#7c3aed" }))!;
    render(<DocBrandHeader brand={b} />);
    const block = screen.getByTestId("doc-brand");
    expect(block).toHaveTextContent("Dra. Ana Souza");
    expect(block).toHaveTextContent("Dermatologia");
    expect(block).toHaveTextContent("CRM 1/SP");
    expect(block).toHaveTextContent("AS");
    expect(block.querySelector("img")).toBeNull();
  });

  it("with a logo: the logo, no initials", () => {
    const b = docBrand(TEMPLATE, brand({ logoWideUrl: "https://cdn/wide.png", own: { logo_square: false, logo_wide: true, photo: false } }))!;
    render(<DocBrandHeader brand={b} />);
    expect(screen.getByTestId("doc-brand").querySelector("img")).toHaveAttribute("src", "https://cdn/wide.png");
  });
});
