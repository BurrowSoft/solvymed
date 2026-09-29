import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { hoursWarning } from "@/lib/scheduleChecks";
import type { WorkingHours } from "@/lib/slots";

const WH: WorkingHours = {
  mon: { enabled: true, start: "08:00", end: "18:00" },
  tue: { enabled: true, start: "08:00", end: "18:00" },
  wed: { enabled: true, start: "08:00", end: "18:00" },
  thu: { enabled: true, start: "08:00", end: "18:00" },
  fri: { enabled: false, start: "08:00", end: "18:00" },
  sat: { enabled: false, start: "08:00", end: "12:00" },
};

describe("hoursWarning (outside the working hours: asked, never blocked)", () => {
  it("inside the hours: nothing", () => {
    expect(hoursWarning("2026-09-29", "09:00", "09:30", WH)).toBeNull();
    expect(hoursWarning("2026-09-29", "17:30", "18:00", WH)).toBeNull();
  });
  it("starting before or ending after the hours: outside, with the day's hours", () => {
    expect(hoursWarning("2026-09-29", "07:30", "08:00", WH)).toEqual({ kind: "outside", start: "08:00", end: "18:00" });
    expect(hoursWarning("2026-09-29", "17:45", "18:15", WH)).toEqual({ kind: "outside", start: "08:00", end: "18:00" });
  });
  it("a disabled or missing day: a day off, by weekday", () => {
    expect(hoursWarning("2026-10-02", "10:00", "10:30", WH)).toEqual({ kind: "day_off", day: "fri" });
    expect(hoursWarning("2026-10-04", "10:00", "10:30", WH)).toEqual({ kind: "day_off", day: "sun" });
  });
  it("hours never set up: no warning", () => {
    expect(hoursWarning("2026-10-02", "10:00", "10:30", null)).toBeNull();
    expect(hoursWarning("2026-10-02", "10:00", "10:30", {})).toBeNull();
  });
});

const load = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "messages", `${locale}.json`), "utf8").replace(/^﻿/, ""));

describe("the booking question's copy (UX's exact strings)", () => {
  const compose = (locale: string, parts: ("blocked" | "outside" | "dayoff")[]) => {
    const t = createTranslator({ locale, messages: load(locale), namespace: "schedule" });
    const out: string[] = [];
    if (parts.includes("blocked")) out.push(t("warnBlocked", { start: "12:00", end: "13:00" }));
    if (parts.includes("outside")) out.push(t("warnOutside", { start: "08:00", end: "18:00" }));
    if (parts.includes("dayoff")) out.push(t("warnDayOff", { day: "fri" }));
    out.push(t("bookAnyway"));
    return out.join(" ");
  };

  it("pt-BR and en match UX word for word", () => {
    expect(compose("pt-BR", ["outside"])).toBe("Este horário está fora do horário de atendimento (08:00–18:00). Agendar mesmo assim?");
    expect(compose("en", ["outside"])).toBe("This time is outside the working hours (08:00–18:00). Book anyway?");
    expect(compose("pt-BR", ["dayoff"])).toBe("Sexta-feira não é dia de atendimento. Agendar mesmo assim?");
    expect(compose("en", ["dayoff"])).toBe("Friday isn't a working day. Book anyway?");
    // Blocked keeps the app's wording.
    expect(compose("pt-BR", ["blocked"])).toBe("Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?");
    // Both at once: one question listing both.
    expect(compose("pt-BR", ["blocked", "outside"])).toBe(
      "Este horário está bloqueado (12:00–13:00). Este horário está fora do horário de atendimento (08:00–18:00). Agendar mesmo assim?",
    );
  });

  it("the overlap's duration is in the locale's words (tester: Thai showed \"min\")", () => {
    const tt = createTranslator({ locale: "th", messages: load("th"), namespace: "schedule" });
    expect(tt("durationMinutes", { n: 30 })).toBe("30 นาที");
    const tj = createTranslator({ locale: "ja", messages: load("ja"), namespace: "schedule" });
    expect(tj("durationMinutes", { n: 30 })).toBe("30分");
  });

  it("the overlap message is the app's", () => {
    const t = createTranslator({ locale: "pt-BR", messages: load("pt-BR"), namespace: "schedule" });
    expect(t("overlapHardMsg", { name: "Maria Silva", time: "10:00", duration: "30 min" }))
      .toBe("Este horário conflita com Maria Silva às 10:00 (30 min). Escolha outro horário.");
  });

  it("every locale formats every weekday and all the new keys", () => {
    const locales = readdirSync(join(__dirname, "..", "messages")).map((f) => f.replace(/\.json$/, ""));
    expect(locales.length).toBe(15);
    for (const locale of locales) {
      const t = createTranslator({ locale, messages: load(locale), namespace: "schedule" });
      for (const day of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) {
        const s = t("warnDayOff", { day });
        expect(s, `${locale} ${day}`).not.toMatch(/[{}]|schedule\./);
      }
      for (const k of ["bookAnyway", "bookAnywayButton", "checkTimeTitle", "overlapGeneric"]) expect(t(k).length, `${locale} ${k}`).toBeGreaterThan(0);
      expect(t("warnOutside", { start: "08:00", end: "18:00" })).toContain("08:00");
      expect(t("overlapHardMsg", { name: "X", time: "10:00", duration: "30 min" })).toContain("10:00");
    }
  });
});
