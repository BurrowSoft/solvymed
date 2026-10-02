import { describe, expect, it } from "vitest";
import { rules } from "@/lib/assistant/server/knowledge";
import { formatDateLabel, formatShortDate, formatTimeLabel } from "@/lib/dateLabels";

// Vitor, build 25 (e7): SolvyAI writes dates day first and times on the
// 24-hour clock in every language, English included.

const say = { language: "English", onlySolvyMed: "", noClinical: "", buttons: [], labels: [], labelMap: new Map() };
const MONTH_FIRST = /\b(0?[1-9]|1[0-2])\/(1[3-9]|2\d|3[01])\/\d{4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) \d{1,2}\b/;

describe("SolvyAI: day-first dates, 24-hour times", () => {
  it("the system prompt says so, in both modes and for web and app", () => {
    for (const mode of ["help", "actions"] as const) {
      for (const client of ["web", "app"] as const) {
        const prompt = rules("en", client, "home", mode, say);
        expect(prompt).toContain("DATES AND TIMES: write every date day first");
        expect(prompt).toContain("never AM/PM");
      }
    }
  });

  it("what the server writes into answers and cards for English is day-first and 24-hour", () => {
    // a sample answer built with the same formatters the server uses
    const answer = `Booked: Maria, ${formatDateLabel("en", "2026-10-05", { weekday: "long", day: "numeric", month: "long" })} (${formatShortDate("en", "2026-10-05")}) at ${formatTimeLabel("en", "14:00")}.`;
    expect(answer).toBe("Booked: Maria, Monday 5 October (05/10/2026) at 14:00.");
    expect(answer).not.toMatch(MONTH_FIRST);
    expect(answer).not.toMatch(/\b(AM|PM)\b/i);
  });

  it("the guard itself catches the US forms", () => {
    expect("on 10/15/2026").toMatch(MONTH_FIRST);
    expect("on October 5").toMatch(MONTH_FIRST);
    expect("on 5 October").not.toMatch(MONTH_FIRST);
  });
});
