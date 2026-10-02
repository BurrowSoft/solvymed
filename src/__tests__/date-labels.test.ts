import { describe, expect, it } from "vitest";
import { formatDateLabel, formatShortDate, formatTimeLabel, plainSpaces } from "@/lib/dateLabels";
import { calendarHeaderLabel, weekdayLabels } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/CalendarView";

// Node's ICU emits thin/narrow no-break spaces where browsers emit plain
// ones; labels must be identical on both sides (React #418 otherwise).
const ODD_SPACES = /[\u00a0\u2009\u202f]/;

describe("plain spaces in labels", () => {
  it("normalizes the spaces ICU versions disagree on", () => {
    expect(plainSpaces("28 de set.\u2009–\u20094 de out.")).toBe("28 de set. – 4 de out.");
    expect(plainSpaces("2:30\u202fPM")).toBe("2:30 PM");
  });

  it("the calendar header and weekday labels contain only plain spaces", () => {
    const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    for (const locale of ["pt-BR", "en", "th", "ja", "de"]) {
      for (const view of ["day", "week", "month"] as const) {
        expect(calendarHeaderLabel(locale, view, "2026-09-28", week)).not.toMatch(ODD_SPACES);
      }
      for (const w of weekdayLabels(locale)) expect(w).not.toMatch(ODD_SPACES);
      expect(formatTimeLabel(locale, "14:30")).not.toMatch(ODD_SPACES);
    }
    expect(calendarHeaderLabel("pt-BR", "week", "2026-09-28", week)).toBe("28 de set. – 4 de out. de 2026");
  });
});

describe("formatDateLabel", () => {
  it("uses the given locale, not the runtime's", () => {
    expect(formatDateLabel("pt-BR", "2026-09-28", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
      .toBe("segunda-feira, 28 de setembro de 2026");
    expect(formatDateLabel("en", "2026-09-28", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
      .toBe("Monday, 28 September 2026");
  });

  it("never shifts the day, whatever the runtime time zone (TZ is São Paulo in tests)", () => {
    expect(formatDateLabel("en", "2026-01-01", { day: "numeric", month: "numeric", year: "numeric" })).toBe("01/01/2026"); // never M/D (Vitor, build 25)
    expect(formatDateLabel("en", "2026-12-31", { day: "numeric", month: "numeric", year: "numeric" })).toBe("31/12/2026");
  });

  it("returns the input when it isn't a date", () => {
    expect(formatDateLabel("en", "soon")).toBe("soon");
  });
});

describe("formatTimeLabel", () => {
  it("formats the stored wall-clock time in the locale", () => {
    expect(formatTimeLabel("pt-BR", "09:05:00")).toBe("9:05");
    expect(formatTimeLabel("en", "14:30")).toBe("14:30");
    expect(formatTimeLabel("pt-BR", "00:00")).toBe("0:00");
  });

  it("returns the input when it isn't a time", () => {
    expect(formatTimeLabel("en", "")).toBe("");
  });
});

// Vitor, build 25 item 7 (a standing BLOCKING check): month-first dates
// appear nowhere, in any language. 5 Oct 2026 must never read 10/05.
describe("no MM/DD in any locale", () => {
  it("the short numeric date is day-first (or year-first) everywhere", async () => {
    const fs = await import("fs");
    const locales = fs.readdirSync("src/messages").map((f: string) => f.replace(".json", ""));
    for (const l of locales) {
      const s = formatShortDate(l, "2026-10-05");
      expect(s, l).not.toMatch(/^10\D0?5\D/);
    }
    expect(formatShortDate("en", "2026-10-05")).toBe("05/10/2026");
    expect(formatShortDate("en-US", "2026-10-05")).toBe("05/10/2026");
  });
});

// e7: 24-hour everywhere, no AM/PM in any language.
describe("24-hour times in every locale", () => {
  it("14:30 never shows as 2:30 / PM / 오후 / 下午 / م", async () => {
    const fs = await import("fs");
    for (const f of fs.readdirSync("src/messages")) {
      const l = f.replace(".json", "");
      const s = formatTimeLabel(l, "14:30");
      expect(s, l).toMatch(/14/);
      expect(s, l).not.toMatch(/PM|AM|오후|下午|午後|م|ب\.ظ/i);
    }
  });
});
