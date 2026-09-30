import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { brandedHtml } from "@/lib/brandedEmail";

// The Founders applicant's confirmation in the Auth emails' branded layout
// (the app's brandedHtml); the team's summary stays plain. Off without
// RESEND_API_KEY.

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => createTranslator({ locale: "pt-BR", messages: pt, namespace: namespace as "founders" }),
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
