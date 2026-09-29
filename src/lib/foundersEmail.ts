import { getTranslations } from "next-intl/server";
import { systemName } from "./founders";

// The Founders application's two emails (spec: Resend, from
// noreply@solvymed.com): the applicant's confirmation in their language,
// and a summary to founders@solvymed.com (no link, nothing about other
// applicants). Off until RESEND_API_KEY is set (Vitor); never blocks or
// fails the application.

const FROM = "SolvyMed <noreply@solvymed.com>";
const TEAM = "founders@solvymed.com";
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function send(key: string, to: string, subject: string, text: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html: `<p>${escape(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>` }),
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
    const first = a.fullName.trim().split(/\s+/)[0] ?? "";
    const body = [
      t("emailHello", { name: first }),
      [t("emailBody", { system }), a.status === "waitlist" ? t("emailWaitlist", { system }) : ""].filter(Boolean).join(" "),
      t("emailNoFiles"),
      t("emailSign"),
    ].join("\n\n");
    await Promise.allSettled([
      send(key, a.email, t("emailSubject"), body),
      send(key, TEAM, `Founders application: ${system} (${a.country}) · ${a.status}`, [
        `Status: ${a.status}`, `Country: ${a.country}`, `System: ${system}`, `Name: ${a.fullName}`, `Email: ${a.email}`, `Locale: ${a.locale}`,
        ...(a.id ? [`Application id: ${a.id}`] : []),
      ].join("\n")),
    ]);
  } catch {
    // Email is best effort: the application is already saved.
  }
}
