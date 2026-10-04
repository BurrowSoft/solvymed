import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthCalendar } from "@/components/MonthCalendar";
import { chosenTimeParts } from "@/lib/chosenTime";
import { countryProfile } from "@/lib/country";

// Q4 on the patient's booking / reschedule sheets (parity with mobile #338):
// the month header in the PRACTICE's calendar, in the reader's words, no
// era; the chosen-time line in the reader's words, 24 h.

const sheet = (locale: string, calendar?: "gregorian" | "buddhist") =>
  render(<MonthCalendar days={["2026-10-09"]} selected="2026-10-09" onSelect={() => {}} isOpen={() => true} locale={locale} calendar={calendar} labels={{ prev: "<", next: ">" }} />);

describe("the booking sheet's month header", () => {
  it("a TH clinic for a pt reader: Portuguese words, 2569, no era", () => {
    sheet("pt-BR", "buddhist");
    const title = screen.getByTestId("month-calendar").textContent ?? "";
    expect(title).toMatch(/outubro de 2569/);
    expect(title).not.toMatch(/BE|E\.B\./);
  });

  it("a BR clinic for a Thai reader: Thai words, 2026", () => {
    sheet("th", "gregorian");
    const title = screen.getByTestId("month-calendar").textContent ?? "";
    expect(title).toContain("ตุลาคม 2026");
    expect(title).not.toContain("2569");
  });

  it("without a practice calendar: as before (the language's own)", () => {
    sheet("th");
    expect(screen.getByTestId("month-calendar").textContent).toContain("2569");
  });
});

describe("the chosen-time line", () => {
  it("in the reader's words on patient screens; a Thai month keeps its dot, others drop it; 24 h", () => {
    const th = countryProfile("TH");
    expect(chosenTimeParts("2026-10-09", "14:00", "14:30", th, "en")).toEqual({ weekday: "Fri", day: "9", month: "Oct", start: "14:00", end: "14:30" });
    expect(chosenTimeParts("2026-10-09", "14:00", "14:30", countryProfile("BR"), "th").month).toBe("ต.ค.");
    expect(chosenTimeParts("2026-10-09", "14:00", "14:30", countryProfile("BR"), "pt-BR").month).toBe("out");
    // Staff screens (no reader): the practice's language, as before.
    expect(chosenTimeParts("2026-10-09", "14:00", "14:30", th).month).toBe("ต.ค.");
  });
});
