import { afterEach, describe, it, expect } from "vitest";
import { addDaysTo, getMonthGrid, getWeekDays } from "@/app/[locale]/dashboard/schedule/CalendarView";

// The calendar runs in the browser's zone. toISOString() is UTC, so for a
// browser east of UTC (Thailand) local midnight used to be the previous
// day, and the month grid started a day early.
const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

describe.each(["America/Sao_Paulo", "Asia/Bangkok", "Asia/Tokyo"])("calendar grid in %s", (tz) => {
  it("starts September 2026 on Monday 31 August and covers the month", () => {
    process.env.TZ = tz;
    const grid = getMonthGrid("2026-09-15");
    expect(grid[0][0]).toBe("2026-08-31");
    expect(grid[0][1]).toBe("2026-09-01");
    expect(grid.flat()).toContain("2026-09-30");
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("gives Monday to Sunday and steps days without drift", () => {
    process.env.TZ = tz;
    expect(getWeekDays("2026-09-27")).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
    expect(addDaysTo("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysTo("2026-10-01", -1)).toBe("2026-09-30");
  });
});
