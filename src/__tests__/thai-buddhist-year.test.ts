import { describe, expect, it } from "vitest";
import { formatDateLabel } from "@/lib/dateLabels";
import { calendarHeaderLabel } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/CalendarView";

// Sprint TH (TH-2): the Thai UI shows the Buddhist year (Gregorian + 543),
// which the "th" locale's default calendar gives with Intl. Stored dates
// stay Gregorian ("YYYY-MM-DD"), and English in Thailand keeps the normal
// year. These lock that in: forcing a calendar (e.g. "-u-ca-gregory") or
// formatting years by hand would break it.
describe("Thai dates use the Buddhist year", () => {
  it("date labels", () => {
    expect(formatDateLabel("th", "2026-09-28", { year: "numeric", month: "long", day: "numeric" })).toContain("2569");
    expect(formatDateLabel("th", "2026-09-28", { year: "numeric", month: "long", day: "numeric" })).not.toContain("2026");
    expect(formatDateLabel("en", "2026-09-28", { year: "numeric", month: "long", day: "numeric" })).toContain("2026");
  });

  it("the calendar header", () => {
    expect(calendarHeaderLabel("th", "month", "2026-09-15", [])).toContain("2569");
    expect(calendarHeaderLabel("th", "day", "2026-09-15", [])).toContain("2569");
    expect(calendarHeaderLabel("en", "month", "2026-09-15", [])).toBe("September 2026");
  });

  it("toLocaleDateString (patient pages, dashboard)", () => {
    const d = new Date("2026-09-28T12:00:00");
    expect(d.toLocaleDateString("th", { year: "numeric", month: "short", day: "numeric" })).toContain("2569");
    expect(d.toLocaleDateString("th")).toContain("2569");
  });

  it("the stored value is unchanged (the calendar only affects display)", () => {
    expect(new Intl.DateTimeFormat("th").resolvedOptions().calendar).toBe("buddhist");
    expect(new Date("2026-09-28T12:00:00").getFullYear()).toBe(2026);
  });
});
