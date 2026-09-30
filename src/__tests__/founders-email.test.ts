import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { brandedHtml } from "@/lib/brandedEmail";

// The Founders applicant's confirmation in the Auth emails' branded layout
// (the app's brandedHtml); the team's summary stays plain. Off without
// RESEND_API_KEY.

const BY_LOCALE: Record<string, typeof pt> = { "pt-BR": pt, en: en as unknown as typeof pt, th: th as unknown as typeof pt };
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: BY_LOCALE[locale] ?? pt, namespace: namespace as "founders" }),
}));

import { sendFounderEmails } from "@/lib/foundersEmail";

type Sent = { to: string[]; subject: string; text: string; html: string };
let sent: Sent[] = [];
beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response("{}"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const APP = { locale: "pt-BR", email: "ana@x.invalid", fullName: "Ana <b>Souza</b>", system: "other", systemOther: "Meu<Sistema>", country: "BR", status: "waitlist" as const, id: "app-1" };

describe("Founders emails", () => {
  it("send nothing without RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await sendFounderEmails(APP);
    expect(sent).toEqual([]);
  });

  it("the applicant's is branded (logo, heading, tagline, all escaped); the team's stays plain", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await sendFounderEmails(APP);
    const applicant = sent.find((m) => m.to[0] === APP.email)!;
    const team = sent.find((m) => m.to[0] === "founders@solvymed.com")!;
    expect(applicant.subject).toBe(pt.founders.emailSubject);
    expect(applicant.html).toContain('<html lang="pt-BR">');
    expect(applicant.html).toContain("https://www.solvymed.com/email/solvymed-logo-white.png");
    expect(applicant.html).toContain("#116E99");
    expect(applicant.html).toContain(">Olá, Ana!</h1>");
    expect(applicant.html).toContain("Meu&lt;Sistema&gt;");
    expect(applicant.html).not.toContain("<Sistema>");
    expect(applicant.html).toContain(`SolvyMed · ${pt.founders.emailTagline}`);
    expect(applicant.text.startsWith("Olá, Ana!\n\n")).toBe(true);
    expect(team.html).not.toContain("solvymed-logo-white.png");
    expect(team.html).toContain("Ana &lt;b&gt;Souza&lt;/b&gt;");
  });

  it("brandedHtml escapes the language too", () => {
    expect(brandedHtml({ lang: 'x"><script>', heading: "h", paragraphs: [], tagline: "t" })).not.toContain("<script>");
  });
});

// UX (1 Oct, 3e on #223): the typed title kept + the first name, never the
// first word; Thai "เรียน" with the title, or "คุณ" without one.
describe("the applicant's greeting", () => {
  const firstTwo = async (fullName: string, locale: string) => {
    sent = [];
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await sendFounderEmails({ ...APP, fullName, locale, status: "new" });
    return sent.find((m) => m.to[0] === APP.email)!.text.split("\n\n");
  };
  const hello = async (fullName: string, locale: string) => (await firstTwo(fullName, locale))[0];

  it("keeps a typed title with the first name", async () => {
    expect(await hello("Dra Ana Souza", "pt-BR")).toBe("Olá, Dra Ana!");
    expect(await hello("Dra. Ana Souza", "pt-BR")).toBe("Olá, Dra. Ana!");
    expect(await hello("dr. John Smith", "en")).toBe("Hi Dr. John,");
    expect(await hello("นพ.สมชาย ใจดี", "th")).toBe("เรียน นพ.สมชาย");
    expect(await hello("พญ. สุดา ดีงาม", "th")).toBe("เรียน พญ.สุดา");
  });

  it("a title alone falls back to the name as typed (9a)", async () => {
    expect(await hello("Dra", "pt-BR")).toBe("Olá, Dra!");
    expect(await hello("Dr.", "en")).toBe("Hi Dr.,");
  });

  it("without a title: the first name", async () => {
    expect(await hello("Ana Souza", "pt-BR")).toBe("Olá, Ana!");
    expect(await hello("John Smith", "en")).toBe("Hi John,");
    expect(await hello("สมชาย ใจดี", "th")).toBe("เรียน คุณสมชาย");
  });

  it("the paragraph after the greeting starts with a capital (en)", async () => {
    expect((await firstTwo("John Smith", "en"))[1]).toMatch(/^Thank you/);
  });
});
