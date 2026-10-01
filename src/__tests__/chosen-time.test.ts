import { describe, expect, it } from "vitest";
import { chosenTimeParts } from "@/lib/chosenTime";

// The chosen-time line (item 10, the same as app #242): the parts in the
// PRACTICE's locale, the label in the page's.
describe("chosenTimeParts", () => {
  it("a Brazilian practice: sex., 3 out · 14:00–14:30 (whatever the page language)", () => {
    expect(chosenTimeParts("2025-10-03", "14:00", "14:30", "pt-BR")).toEqual({ weekday: "sex.", day: "3", month: "out", start: "14:00", end: "14:30" });
  });

  it("a Thai practice keeps the month's dot", () => {
    const p = chosenTimeParts("2025-10-03", "14:00", "14:30", "th");
    expect(p.month).toBe("ต.ค.");
    expect(p.day).toBe("3");
  });
});
