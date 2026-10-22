import { describe, expect, it, vi } from "vitest";

// The cookie button needs the intl provider; §6h's render test only reads the text.
vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));
import { consentMetadata, legalDateLabel, PRIVACY_PUBLISHED, PRIVACY_VERSION, TERMS_PUBLISHED, TERMS_VERSION } from "@/lib/legalVersions";

describe("legal versions (TH-3 consent)", () => {
  it("are YYYY-MM-DD dates (the format migration 111 accepts)", () => {
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the signup sends both versions and the platform", () => {
    expect(consentMetadata()).toEqual({ privacy_version: PRIVACY_VERSION, terms_version: TERMS_VERSION, privacy_consent_platform: "web" });
  });

  it("the pages' date label", () => {
    expect(legalDateLabel("en", "2026-09-28")).toBe("28 September 2026");
    expect(legalDateLabel("pt-BR", "2026-09-28")).toBe("28 de setembro de 2026");
  });

  // The IDs are often chosen ahead; the pages print the day the text went
  // live instead, and that can never be a day that hasn't come yet (02:
  // "Last updated: 17 October" was shown from 9 October).
  it("the published dates are real days, never in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const d of [PRIVACY_PUBLISHED, TERMS_PUBLISHED]) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d <= today).toBe(true);
    }
    expect(legalDateLabel("pt-BR", TERMS_PUBLISHED)).toBe("30 de setembro de 2026");
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

describe("privacy 2026-10-21: §6f My brand and Document Studio (the Studio launch)", () => {
  it("the Studio flip and the version go together (the accepting migration for 2026-10-21 applied first)", async () => {
    const { conditionMet } = await import("@/lib/conditions");
    if (conditionMet("document-studio-live")) expect(PRIVACY_VERSION >= "2026-10-21").toBe(true);
  });

  it("§6f says what's live, in both languages, and nothing that isn't (text = enforcement)", async () => {
    const fs = await import("node:fs");
    const en = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyEn.tsx", "utf8");
    const pt = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyPtBR.tsx", "utf8");
    expect(en).toContain("6f. My brand and Document Studio (professionals)");
    expect(pt).toContain("6f. Minha marca e Document Studio (profissionais)");
    expect(en).toContain("Posters, social images and letterheads are made on the professional&rsquo;s own device");
    expect(pt).toContain("Cartazes, imagens para redes sociais e papéis timbrados são gerados no próprio aparelho do profissional");
    expect(en).toContain("The brand, the document design and their images are deleted");
    expect(pt).toContain("A marca, o design dos documentos e suas imagens são apagados");
    // Not live yet, so not in §6f: the uploaded signature image and the
    // reversed logo (§3.8's drawn-signature bullets are the app's, #533).
    const sixF = (s: string) => s.slice(s.indexOf('title="6f.'), s.indexOf("<Section", s.indexOf('title="6f.')));
    expect(sixF(en).length).toBeGreaterThan(100);
    // Nor a poster image upload (brand-asset's poster_image, public once enabled;
    // off behind STUDIO_ASSET_KINDS, like logo_reversed; ad F1).
    for (const w of ["signature image", "handwritten", "reversed logo", "poster image", "image for the poster"]) expect(sixF(en).toLowerCase()).not.toContain(w);
    for (const w of ["imagem da sua assinatura", "próprio punho", "logo invertido", "imagem do cartaz", "imagem para o cartaz"]) expect(sixF(pt).toLowerCase()).not.toContain(w);
  });
});

// Google's photo keys in the auth metadata (avatar_url, picture), however
// they're read: .avatar_url, ?.picture, ["picture"]. The app has its own
// guard (3e moves it to our own key); this one covers the web's src/.
const PHOTO_READ = /avatar_url|\bpicture\b["']?\s*\]|(?:user_metadata|identity_data|meta)\??\.picture\b/;

describe("privacy 2026-10-22: §3.1 Sign in with Google (232; text = enforcement)", () => {
  it("the photo guard's pattern catches every way of reading the keys (and not unrelated words)", () => {
    for (const hit of ["user.user_metadata.avatar_url", "user?.user_metadata?.picture", "user.user_metadata.picture",
      "meta?.picture", "meta[\"picture\"]", "identity_data.picture", "{ avatar_url: x }"]) expect(PHOTO_READ.test(hit), hit).toBe(true);
    for (const miss of ["disablePictureInPicture", "picture_filename", "a picture of the clinic"]) expect(PHOTO_READ.test(miss), miss).toBe(false);
  });

  it("the version is 2026-10-22 or later (mobile 233 accepting it applied first)", () => {
    expect(PRIVACY_VERSION >= "2026-10-22").toBe(true);
  });

  it("§3.1 says what Google sign-in does, in both languages, and nothing more", async () => {
    const fs = await import("node:fs");
    const en = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyEn.tsx", "utf8");
    const pt = fs.readFileSync("src/app/[locale]/(site)/privacy/PrivacyPtBR.tsx", "utf8");
    const s31 = (s: string, label: string) => s.slice(s.indexOf(label), s.indexOf("</p>", s.indexOf(label)));
    const e = s31(en, "3.1 Account information");
    const p = s31(pt, "3.1 Dados de conta");
    // A password only for e-mail sign-ups (a Google account has none).
    expect(e).toContain("if you sign up with an email, a password");
    expect(p).toContain("se você se cadastrar com e-mail, senha");
    // The scopes are openid/email/profile: the name and the e-mail (verified).
    expect(e).toContain("Google tells us your name and email address and that the address is verified");
    expect(p).toContain("o Google nos informa seu nome e seu e-mail e que o endereço é verificado");
    // The photo link sits in the auth record (Supabase keeps the profile
    // metadata) but nothing renders or uses it: said exactly so.
    expect(e).toContain("it stays in your sign-in record, but we never show or use it");
    expect(p).toContain("ele fica guardado no seu registro de acesso, mas nunca o exibimos nem o usamos");
    // Nothing is posted to Google or read beyond that.
    expect(e).toContain("We don&apos;t post anything to your Google account or read anything else from it");
    expect(p).toContain("Não publicamos nada na sua conta Google nem lemos nada além disso");
    // §5 lists processors under contract: Google sign-in isn't one (01).
    expect(en).not.toMatch(/\["Google",\s*"Sign/);
  });

  it("no web code reads Google's profile photo (what §3.1 promises)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); continue; }
        if (!/.(ts|tsx)$/.test(e.name)) continue;
        if (PHOTO_READ.test(fs.readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk("src");
    expect(hits).toEqual([]);
  });
});

describe("privacy 2026-10-23: §6h Demo mode (234 + #596–#598; text = enforcement)", () => {
  it("the version is 2026-10-23 or later (mobile 234 accepting it applied first)", () => {
    expect(PRIVACY_VERSION >= "2026-10-23").toBe(true);
  });

  it("§6h and its §9 line show only with demo-mode-live, in both languages", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { PrivacyEn } = await import("@/app/[locale]/(site)/privacy/PrivacyEn");
    const { PrivacyPtBR } = await import("@/app/[locale]/(site)/privacy/PrivacyPtBR");
    const html = (C: typeof PrivacyEn, demo: boolean) => renderToStaticMarkup(createElement(C, { turnstile: false, demo }));
    expect(html(PrivacyEn, false)).not.toContain("6h. Demo mode");
    expect(html(PrivacyPtBR, false)).not.toContain("6h. Modo demonstração");
    const en = html(PrivacyEn, true);
    const pt = html(PrivacyPtBR, true);
    expect(en).toContain("6h. Demo mode");
    expect(pt).toContain("6h. Modo demonstração");
    expect(en).toContain("<strong>Demo mode</strong>: the demo");
    expect(pt).toContain("<strong>Modo demonstração</strong>: os dados fictícios");
    // What 234 and the web enforce: the 5-message SolvyAI quota (demo_quota),
    // the salted IP hash, the 24 h cleanup and end_demo on leaving or signing up.
    for (const s of ["up to 5 messages", "salted hash", "deleted 24 hours after it starts", "Nothing from the demo is copied into a real account", "can’t upload files"]) expect(en).toContain(s);
    for (const s of ["até 5 mensagens", "hash com sal", "apagados 24 horas depois do início", "Nada da demonstração é copiado para uma conta real", "não permite enviar arquivos"]) expect(pt).toContain(s);
  });

  it("the page passes demo-mode-live (a known condition)", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/[locale]/(site)/privacy/page.tsx", "utf8");
    expect(page).toContain('conditionMet("demo-mode-live")');
    expect(page.match(/demo=\{demo\}/g)).toHaveLength(2);
    const conditions = JSON.parse(fs.readFileSync("content/help/conditions.json", "utf8"));
    expect(conditions["demo-mode-live"]).toBeDefined();
  });
});
