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
    for (const s of ["up to 5 messages", "salted hash", "deleted within 24 hours of the start, or right away when you leave the demo or create an account", "Nothing from the demo is copied into a real account", "can’t upload files"]) expect(en).toContain(s);
    for (const s of ["até 5 mensagens", "hash com sal", "apagados em até 24 horas depois do início, ou na hora, quando você sai da demonstração ou cria uma conta", "Nada da demonstração é copiado para uma conta real", "não permite enviar arquivos"]) expect(pt).toContain(s);
  });

  it("the demo's Cloudflare (Turnstile) check: its own §5 row and §6h line, only with demo-mode-live; the sign-up row stays dormant", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { PrivacyEn } = await import("@/app/[locale]/(site)/privacy/PrivacyEn");
    const { PrivacyPtBR } = await import("@/app/[locale]/(site)/privacy/PrivacyPtBR");
    const html = (C: typeof PrivacyEn, demo: boolean) => renderToStaticMarkup(createElement(C, { turnstile: false, demo }));
    const en = html(PrivacyEn, true);
    const pt = html(PrivacyPtBR, true);
    const cells = (s: string) => [...s.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    const row = (s: string) => { const c = cells(s); const i = c.indexOf("Cloudflare (Turnstile)"); return i < 0 ? null : c.slice(i, i + 3); };
    expect(row(en)).toEqual(["Cloudflare (Turnstile)", "Checks that a person, not a bot, is starting the demo", "Global"]);
    expect(row(pt)).toEqual(["Cloudflare (Turnstile)", "Verifica que é uma pessoa, e não um robô, que está iniciando a demonstração", "Global"]);
    expect(en).toContain("Before the demo starts, Cloudflare Turnstile checks that you’re a person, not a bot.");
    expect(pt).toContain("Antes de a demonstração começar, o Cloudflare Turnstile verifica que você é uma pessoa, e não um robô.");
    // The sign-up / sign-in row is still the dormant one (turnstile off).
    expect(en).not.toContain("Protects sign-up, sign-in and password reset");
    expect(pt).not.toContain("Protege cadastro, login");
    for (const off of [html(PrivacyEn, false), html(PrivacyPtBR, false)]) expect(off).not.toContain("Cloudflare (Turnstile)");
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

describe("privacy 2026-10-28: Patient Channel, reminders, app referrer, app demo, automatic WhatsApp (Vitor's OKs, 10-27)", () => {
  const CONDITIONS = ["patient-channel-live", "pc-cover-live", "pc-ai-live", "reminders-live", "app-referrer-live", "app-demo-live", "whatsapp-auto-live"];
  const render = async (props: Record<string, boolean>) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { PrivacyEn } = await import("@/app/[locale]/(site)/privacy/PrivacyEn");
    const { PrivacyPtBR } = await import("@/app/[locale]/(site)/privacy/PrivacyPtBR");
    return {
      en: renderToStaticMarkup(createElement(PrivacyEn, { turnstile: false, demo: true, ...props })),
      pt: renderToStaticMarkup(createElement(PrivacyPtBR, { turnstile: false, demo: true, ...props })),
    };
  };

  it("any of its conditions met needs PRIVACY_VERSION 2026-10-28 or later (mobile 248 accepting it applied first)", async () => {
    const fs = await import("node:fs");
    const conditions = JSON.parse(fs.readFileSync("content/help/conditions.json", "utf8"));
    for (const id of CONDITIONS) {
      expect(conditions[id], id).toBeDefined();
      if (conditions[id].met) expect(PRIVACY_VERSION >= "2026-10-28", id).toBe(true);
    }
  });

  it("with none of them, the page is exactly as before", async () => {
    const off = await render({});
    for (const s of ["6i. Patient Channel", "one-time account reminders", "at most once", "Google Play", "or in the Android app"]) expect(off.en).not.toContain(s);
    for (const s of ["6i. Canal do Paciente", "lembretes únicos", "no máximo uma vez", "Google Play", "ou no app Android"]) expect(off.pt).not.toContain(s);
    expect(off.en).toContain("which appointment and kind of notice it is");
  });

  it("each part shows only with its own flag, word for word, in both languages", async () => {
    const pc = await render({ patientChannel: true });
    expect(pc.en).toContain("6i. Patient Channel (&quot;Fale com o Médico&quot;)");
    expect(pc.pt).toContain("6i. Canal do Paciente (&quot;Fale com o Médico&quot;)");
    expect(pc.en).toContain("The patient never sees the score or the priority.");
    expect(pc.en).toContain("The exception is Patient Channel requests: secretaries see the administrative ones");
    expect(pc.pt).toContain("A abertura de uma solicitação fica registrada no log de acessos.");
    expect(pc.en).toContain("Patient Channel requests and replies are part of the medical record");
    // PC-9 and PC-10 wait for their own features. (PC-N1/N2, the channel's
    // notices, come with their 247 rewrite and Vitor's OK: not in this text.)
    for (const s of ["cover image", "SolvyAI reads the patient", "New message from a patient"]) expect(pc.en).not.toContain(s);
    const pcAll = await render({ patientChannel: true, pcCover: true, pcAi: true });
    expect(pcAll.en).toContain("the cover image is public once saved");
    expect(pcAll.en).toContain("It never answers the patient.");
    expect(pcAll.pt).toContain("Ele nunca responde ao paciente.");
    expect(pcAll.en).toContain("which appointment and kind of notice it is");
    // The sub-parts never show without the section's own condition.
    expect((await render({ pcCover: true, pcAi: true })).en).not.toMatch(/cover image|SolvyAI reads the patient/);

    const rem = await render({ reminders: true });
    expect(rem.en).toContain("To send, at most once, a reminder to finish your sign-up or to set up your practice (by e-mail, and as a push notification if you use the app). Every reminder has a link to stop them.");
    expect(rem.pt).toContain("Para enviar, no máximo uma vez, um lembrete para concluir o cadastro ou configurar sua clínica (por e-mail e, se você usa o app, por notificação push). Todo lembrete tem um link para não recebê-los mais.");
    expect(rem.en).toContain("password resets, one-time account reminders)");
    expect(rem.pt).toContain("redefinição de senha, lembretes únicos sobre a conta)");
    expect(rem.en).toContain("changes and cancellations and, at most once, a reminder to set up your practice.");
    expect(rem.pt).toContain("alterações e cancelamentos e, no máximo uma vez, um lembrete para configurar sua clínica.");

    const ref = await render({ appReferrer: true });
    expect(ref.en).toContain("In the Android app, with the same consent, we save the campaign that led to the install (UTM tags from Google Play) with your account when you sign up.");
    expect(ref.pt).toContain("No app Android, com o mesmo consentimento, salvamos a campanha que levou à instalação (tags UTM do Google Play) com a sua conta ao se cadastrar.");

    const demo = await render({ appDemo: true });
    expect(demo.en).toContain("without an account at solvymed.com/demo or in the Android app.");
    expect(demo.pt).toContain("sem conta em solvymed.com/demo ou no app Android.");
  });

  it("the page passes each condition (app-demo-live only with demo-mode-live)", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/[locale]/(site)/privacy/page.tsx", "utf8");
    for (const id of CONDITIONS) expect(page).toContain(`conditionMet("${id}")`);
    expect(page).toContain('demo && conditionMet("app-demo-live")');
    expect(page.match(/\{\.\.\.v1028\}/g)).toHaveLength(2);
  });
});
