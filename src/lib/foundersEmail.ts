import { getTranslations } from "next-intl/server";
import { systemName } from "./founders";
import { greetingName } from "./doctorName";
import { brandedHtml, escapeHtml } from "./brandedEmail";

// The Founders application's two emails (spec: Resend, from
// noreply@solvymed.com): the applicant's confirmation in their language,
// and a summary to founders@solvymed.com (no link, nothing about other
// applicants). Off until RESEND_API_KEY is set (Vitor); never blocks or
// fails the application.

const FROM = "SolvyMed <noreply@solvymed.com>";
const TEAM = "founders@solvymed.com";

// html defaults to the plain text in paragraphs (the team's summaries); the
// applicant's email passes the branded layout.
async function send(key: string, to: string, subject: string, text: string, html?: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html: html ?? `<p>${escapeHtml(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>` }),
  });
}

export async function sendFounderEmails(a: {
  locale: string; email: string; fullName: string; system: string; systemOther: string; country: string; status: "new" | "waitlist"; id?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return;
  try {
    const t = await getTranslations({ locale: a.locale, namespace: "founders" });
    const system = a.system === "other" && a.systemOther ? a.systemOther : systemName(a.system);
    // The typed title kept + the first name (UX: "Olá, Dra. Ana!", "เรียน
    // นพ.สมชาย"); never the first word, which may be the title itself.
    const { title, first } = greetingName(a.fullName);
    const hello = title ? t("emailHelloTitled", { title, name: first }) : t("emailHello", { name: first });
    const paragraphs = [
      [t("emailBody", { system }), a.status === "waitlist" ? t("emailWaitlist", { system }) : ""].filter(Boolean).join(" "),
      t("emailNoFiles"),
      t("emailSign"),
    ];
    const html = brandedHtml({ lang: a.locale, heading: hello, paragraphs, tagline: t("emailTagline") });
    await Promise.allSettled([
      send(key, a.email, t("emailSubject"), [hello, ...paragraphs].join("\n\n"), html),
      send(key, TEAM, `Founders application: ${system} (${a.country}) · ${a.status}`, [
        `Status: ${a.status}`, `Country: ${a.country}`, `System: ${system}`, `Name: ${a.fullName}`, `Email: ${a.email}`, `Locale: ${a.locale}`,
        ...(a.id ? [`Application id: ${a.id}`] : []),
      ].join("\n")),
    ]);
  } catch {
    // Email is best effort: the application is already saved.
  }
}

// Stage 2: a founder uploaded a test export. The team hears which account
// and where the file is (in the private bucket); nothing about its contents.
export async function sendFounderUploadNotice(a: { userId: string; email: string; path: string; sampleId: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return;
  try {
    await send(key, TEAM, `Founders upload: ${a.email || a.userId}`, [
      `Account: ${a.email || "—"} (${a.userId})`, `File: founder-samples/${a.path}`, `Sample id: ${a.sampleId || "—"}`,
    ].join("\n"));
  } catch {
    // Best effort: the upload is already registered.
  }
}
