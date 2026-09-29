import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { practiceFallbackLocale, pushLocale, pushText, pushWhen, type PushKind, type PushLocale } from "@/lib/pushText";
import { patientPushLocale, professionalPushLocale } from "@/lib/pushRecipient";

// Pushes from the website's server actions speak the recipient's language,
// with dates in its format (UX 2026-09-29): never English-only, never a raw
// YYYY-MM-DD.
describe("push texts", () => {
  it("in the recipient's language, with the locale's date (Thai: Buddhist year)", () => {
    // The clinic's own pushes (08's texts, the app's #111 wording).
    expect(pushText("pt-BR", "apptCancelledByClinic", { clinic: "Clínica Sol", date: "29/09/2026", time: "14:00" }))
      .toEqual({ title: "Consulta cancelada", body: "Clínica Sol cancelou sua consulta de 29/09/2026 às 14:00. Para marcar outra, abra o app." });
    expect(pushText("en", "apptBookedByClinic", { clinic: "Sun Clinic", date: "09/29/2026", time: "14:00" }))
      .toEqual({ title: "New appointment", body: "Sun Clinic booked an appointment for you on 09/29/2026 at 14:00." });
    // A name is text, never a replacement pattern.
    expect(pushText("en", "apptBookedByClinic", { clinic: "A$&B", date: "d", time: "t" }).body).toBe("A$&B booked an appointment for you on d at t.");
    expect(pushText("en", "proposalAccepted", { name: "Maria Silva", when: pushWhen("en", "2026-09-29", "14:00") }).body)
      .toBe("Maria Silva accepted the new time: 09/29/2026 14:00.");
    expect(pushWhen("th", "2026-09-29", "14:00")).toBe("29/09/2569 14:00");
  });

  it("a note is added in the same language", () => {
    expect(pushText("pt-BR", "apptConfirmed", { note: "Traga os exames" }).body).toBe("Sua consulta foi confirmada. Observação: Traga os exames");
    expect(pushText("en", "apptConfirmed", { note: null }).body).toBe("Your appointment has been confirmed.");
  });

  it("every language has every push, with no placeholder left over", () => {
    const kinds: PushKind[] = [
      "apptConfirmed", "bookingNotAvailable", "newTimeProposed", "proposalAccepted", "proposalDeclined",
      "rescheduleRequested", "rescheduleConfirmed", "rescheduleConfirmedNoTime", "rescheduleDeclined",
      "apptBookedByClinic", "apptCancelledByClinic", "newBookingRequest",
    ];
    const locales: PushLocale[] = ["pt-BR", "en", "es", "fr", "de", "it", "th"];
    for (const l of locales) for (const k of kinds) {
      const { title, body } = pushText(l, k, { name: "X", when: "W", clinic: "C", date: "D", time: "T" });
      expect(title.length, `${l} ${k}`).toBeGreaterThan(0);
      expect(body, `${l} ${k}`).not.toMatch(/[{}]/);
    }
  });

  it("stored locales are normalised; unknown ones fall back to the practice's", () => {
    expect(pushLocale("pt-BR")).toBe("pt-BR");
    expect(pushLocale("pt")).toBe("pt-BR");
    expect(pushLocale("en-US")).toBe("en");
    expect(pushLocale("th")).toBe("th");
    expect(pushLocale("ja")).toBeNull();
    expect(pushLocale(null)).toBeNull();
    expect(practiceFallbackLocale("BR")).toBe("pt-BR");
    expect(practiceFallbackLocale("TH")).toBe("th");
    expect(practiceFallbackLocale("US")).toBe("en");
    // Before migration 110 there's no country: every practice is Brazilian.
    expect(practiceFallbackLocale(null)).toBe("pt-BR");
  });

  it("the clinic's pushes follow the practice's country (not the unwritten professionals.locale default)", async () => {
    const db = (country: string | null, locale = "pt-BR") => ({
      rpc: async () => ({ data: [{ country }], error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { locale }, error: null }) }) }) }),
    }) as unknown as Parameters<typeof professionalPushLocale>[0];
    expect(await professionalPushLocale(db("TH"), "d")).toBe("th");
    expect(await professionalPushLocale(db("BR"), "d")).toBe("pt-BR");
    expect(await professionalPushLocale(db("US"), "d")).toBe("en");
    // A patient's saved language wins; without one, the practice's.
    expect(await patientPushLocale(db("BR", "en"), "p", "d")).toBe("en");
    const noSaved = { ...db("TH"), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as unknown as Parameters<typeof patientPushLocale>[0];
    expect(await patientPushLocale(noSaved, "p", "d")).toBe("th");
  });

  it("Thai: one title for an appointment cancelled by the clinic (Schedule / archive and account close)", () => {
    const th = JSON.parse(readFileSync(join(__dirname, "..", "messages", "th.json"), "utf8").replace(/^﻿/, ""));
    const cancelled = pushText("th", "apptCancelledByClinic", { clinic: "C", date: "D", time: "T" });
    expect(cancelled.title).toBe(th.accountClose.pushCancelledTitle);
    // The Schedule / archive one names the clinic (08's text); both say it was cancelled.
    expect(cancelled.body).toContain("ยกเลิก");
    expect(th.accountClose.pushCancelledBody).toContain("ยกเลิก");
  });

  it("no push in src is sent with literal (English) text", () => {
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/sendExpoPush\(\s*[^,]+,\s*([`"'])/g)) offenders.push(`${p.slice(root.length)}: ${m[0]}`);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
