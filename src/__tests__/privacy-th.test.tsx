import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyTh } from "@/app/[locale]/(site)/privacy/PrivacyTh";
import { legalLangFor } from "@/components/LegalDoc";
import { legalDateLabel } from "@/lib/legalVersions";
import { conditionMet } from "@/lib/conditions";

// The Thai Privacy Policy (a draft for Vitor's first pass, privacy-th-live):
// it must never say more, or less, than the English. Every conditional part
// of PrivacyEn exists in PrivacyTh, so the two have the same shape for every
// combination of flags.

const FLAGS = ["solvyai", "line", "notices", "whatsapp", "address", "founders", "founderUploads", "secretaryInvites", "closureNotices", "whatsappAuto", "referrals", "clinicalDocs", "patientDocs", "selfFields", "demo", "appDemo", "patientChannel", "pcCover", "pcAi", "reminders", "appReferrer", "pcNotify", "whatsappOptout"] as const;

const shape = (html: string) => ({
  sections: (html.match(/<h2/g) ?? []).length,
  items: (html.match(/<li/g) ?? []).length,
  paragraphs: (html.match(/<p/g) ?? []).length,
  rows: (html.match(/<tr/g) ?? []).length,
  strong: (html.match(/<strong/g) ?? []).length,
});
const render = (C: typeof PrivacyEn, props: Record<string, boolean>) => renderToStaticMarkup(createElement(C, { turnstile: false, ...props }));
// The Thai page has one paragraph more: §1's note that the English prevails.
const thShape = (html: string) => { const s = shape(html); return { ...s, paragraphs: s.paragraphs - 1 }; };
// Vitor's 10-27 lines (#664) are in the Thai too (01: the catch-up before his Thai read-through),
// so the two have the same shape again for every flag, the 10-27 ones included.

describe("Thai Privacy Policy (privacy-th-live)", () => {
  it("is hidden today: /th gets the English page", () => {
    expect(conditionMet("privacy-th-live")).toBe(false);
    expect(legalLangFor("th")).toBe("en");
    expect(legalLangFor("th", conditionMet("privacy-th-live"))).toBe("en");
  });

  it("once met, only /th switches to Thai (pt-BR and en unchanged)", () => {
    expect(legalLangFor("th", true)).toBe("th");
    expect(legalLangFor("pt-BR", true)).toBe("pt-BR");
    expect(legalLangFor("en", true)).toBe("en");
    expect(legalLangFor("ja", true)).toBe("en");
  });

  it("the same shape as the English with no flag, with every flag, and with each flag alone", () => {
    expect(thShape(render(PrivacyTh, {}))).toEqual(shape(render(PrivacyEn, {})));
    const all = Object.fromEntries(FLAGS.map((f) => [f, true]));
    expect(thShape(render(PrivacyTh, { ...all, turnstile: true }))).toEqual(shape(render(PrivacyEn, { ...all, turnstile: true })));
    for (const f of FLAGS) {
      // founderUploads only shows with founders; appDemo's words live inside §6h; the 10-27 AI
      // lines live inside §6i, the WhatsApp opt-out inside §6e's automatic WhatsApp line.
      const props: Record<string, boolean> =
        f === "founderUploads" ? { founders: true, founderUploads: true }
        : f === "appDemo" ? { demo: true, appDemo: true }
        : f === "pcAi" || f === "pcCover" ? { patientChannel: true, [f]: true }
        : f === "whatsappOptout" ? { notices: true, whatsapp: true, whatsappAuto: true, whatsappOptout: true }
        : f === "pcNotify" ? { pcNotify: true, line: true, whatsappAuto: true }
        : { [f]: true };
      expect(thShape(render(PrivacyTh, props)), f).toEqual(shape(render(PrivacyEn, props)));
    }
  });

  it("each flag changes the Thai text exactly when it changes the English", () => {
    const base = { en: render(PrivacyEn, { demo: true }), th: render(PrivacyTh, { demo: true }) };
    for (const f of FLAGS) {
      const props: Record<string, boolean> = f === "founderUploads" ? { demo: true, founders: true, founderUploads: true } : { demo: true, [f]: true };
      const en = render(PrivacyEn, props) !== base.en;
      const th = render(PrivacyTh, props) !== base.th;
      expect(th, f).toBe(en);
    }
  });

  it("is written in Thai, keeps the controller's address as in the English, and says which language prevails", () => {
    const th = render(PrivacyTh, {});
    expect(th).toContain("นโยบายนี้มีฉบับภาษาอังกฤษ ภาษาโปรตุเกส และภาษาไทย หากข้อความในแต่ละภาษาไม่ตรงกัน ให้ถือตามฉบับภาษาอังกฤษ");
    expect(th).toContain("297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Thailand");
    expect(th).toContain("10b. ประเทศไทย (PDPA)");
  });

  it("the Thai date shows the Buddhist-era year", () => {
    expect(legalDateLabel("th", "2026-10-26")).toBe("26 ตุลาคม 2569");
    expect(legalDateLabel("en", "2026-10-26")).toBe("26 October 2026");
  });

  it("the page passes privacy-th-live (a known condition)", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/[locale]/(site)/privacy/page.tsx", "utf8");
    expect(page).toContain('conditionMet("privacy-th-live")');
    expect(page).toContain("<PrivacyTh ");
  });
});
