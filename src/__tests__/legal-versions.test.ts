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
    expect(legalDateLabel("en", "2026-09-28")).toBe("28 September 2026");
    expect(legalDateLabel("pt-BR", "2026-09-28")).toBe("28 de setembro de 2026");
  });
});

describe("the secretary-invite flip (2026-10-02)", () => {
  it("the flag and the privacy version go together (mobile 156 accepts 2026-10-02)", async () => {
    const { conditionMet } = await import("@/lib/conditions");
    expect(conditionMet("secretary-invite-email-live")).toBe(true);
    // 2026-10-02 or later (a later policy bump keeps the invite text).
    expect(PRIVACY_VERSION >= "2026-10-02").toBe(true);
  });
});

describe("the SolvyAI go-live (2026-10-12)", () => {
  it("solvyai-live and the privacy version go together (mobile 198 accepts 2026-10-12)", async () => {
    const { conditionMet } = await import("@/lib/conditions");
    if (conditionMet("solvyai-live")) expect(PRIVACY_VERSION >= "2026-10-12").toBe(true);
  });
});

describe("privacy 2026-10-13: §3.2 lists the patient data actually held", () => {
  it("names RG, profession, the emergency phone, the insurance type and the photo, in both languages", async () => {
    expect(PRIVACY_VERSION >= "2026-10-13").toBe(true);
    const fs = await import("node:fs");
    const en = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyEn.tsx", "utf8");
    const pt = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyPtBR.tsx", "utf8");
    for (const w of ["CPF and RG, Brazilian clinics only", "profession", "an emergency contact phone number", "health insurance type", "photo", "tags the professional adds to the patient"]) expect(en).toContain(w);
    for (const w of ["CPF e RG, só clínicas no Brasil", "profissão", "telefone de um contato de emergência", "tipo de convênio", "foto", "etiquetas que o profissional adiciona ao paciente"]) expect(pt).toContain(w);
  });
});
