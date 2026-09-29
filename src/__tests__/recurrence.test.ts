import { describe, expect, it } from "vitest";
import { recurrenceDates } from "@/lib/recurrence";

// The same series dates as the app's recurrenceDates (lib/services).
describe("recurrenceDates", () => {
  it("weekly, every 2 weeks, monthly; the first date included", () => {
    expect(recurrenceDates("2026-10-05", "weekly", 3)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(recurrenceDates("2026-12-21", "biweekly", 3)).toEqual(["2026-12-21", "2027-01-04", "2027-01-18"]);
    expect(recurrenceDates("2026-10-15", "monthly", 4)).toEqual(["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
  });
  it("monthly on the 31st rolls over like the app (JavaScript dates)", () => {
    expect(recurrenceDates("2027-01-31", "monthly", 3)).toEqual(["2027-01-31", "2027-03-03", "2027-03-31"]);
  });
  it("across the Brazilian / any DST change the dates stay dates", () => {
    expect(recurrenceDates("2026-11-01", "weekly", 2)).toEqual(["2026-11-01", "2026-11-08"]);
  });
});
