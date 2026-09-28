import { describe, expect, it } from "vitest";
import { consentMetadata, legalDateLabel, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legalVersions";

describe("legal versions (TH-3 consent)", () => {
  it("are YYYY-MM-DD dates (the format migration 111 accepts)", () => {
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the signup sends both versions and the platform", () => {
    expect(consentMetadata()).toEqual({ privacy_version: PRIVACY_VERSION, terms_version: TERMS_VERSION, privacy_consent_platform: "web" });
  });

  it("the pages' date label matches the version", () => {
    expect(legalDateLabel("en", "2026-09-28")).toBe("September 28, 2026");
    expect(legalDateLabel("pt-BR", "2026-09-28")).toBe("28 de setembro de 2026");
  });
});
