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
    for (const w of ["CPF and RG, Brazilian clinics only", "profession", "an emergency contact phone number", "health insurance type", "photo", "tags the professional adds to the patient", "archive status (for example, deceased, when imported)"]) expect(en).toContain(w);
    for (const w of ["CPF e RG, só clínicas no Brasil", "profissão", "telefone de um contato de emergência", "tipo de convênio", "foto", "etiquetas que o profissional adiciona ao paciente", "situação de arquivamento (por exemplo, falecido, quando importado)"]) expect(pt).toContain(w);
  });
});

describe("privacy 2026-10-16: §3.1 card payment link (1.8.0 E), with the card-payment-live flip", () => {
  it("the flag and the version go together (the accepting migration for 2026-10-16 applied first)", async () => {
    const { conditionMet } = await import("@/lib/conditions");
    if (conditionMet("card-payment-live")) expect(PRIVACY_VERSION >= "2026-10-16").toBe(true);
  });

  it("§3.1 names the tax ID per country, Pix or PromptPay, and the card link, unconditionally, in both languages (Vitor's B)", async () => {
    const fs = await import("node:fs");
    const en = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyEn.tsx", "utf8");
    const pt = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyPtBR.tsx", "utf8");
    expect(en).toContain("clinic name, address, phone, a tax ID (CNPJ in Brazil, the 13-digit tax ID in Thailand), a Pix key or PromptPay ID, and a card payment link.");
    expect(pt).toContain("nome da clínica, endereço, telefone, um identificador fiscal (CNPJ no Brasil, o número fiscal de 13 dígitos na Tailândia), uma chave Pix ou ID PromptPay e um link de pagamento com cartão.");
    expect(en + pt).not.toContain("cardLink");
  });
});

describe("privacy 2026-10-17: the 1.8.0 release (documents, clinical documents, C2)", () => {
  it("the three flips and the version go together (mobile 215 accepts 2026-10-17 first)", async () => {
    const { conditionMet } = await import("@/lib/conditions");
    for (const c of ["patient-documents-live", "clinical-documents-live", "c2-patient-step-live"] as const) {
      if (conditionMet(c)) expect(PRIVACY_VERSION >= "2026-10-17").toBe(true);
    }
  });
});
