import { describe, it, expect } from "vitest";
import { computeSlots, toMinutes, fromMinutes, filterPastSlots } from "@/lib/slots";
import type { WorkingHours } from "@/lib/slots";

// Wednesday 2025-01-08 (index 3 = wed)
const WED = "2025-01-08";
// Saturday 2025-01-11 (index 6 = sat)
const SAT = "2025-01-11";

const HOURS: WorkingHours = {
  wed: { enabled: true, start: "09:00", end: "17:00" },
  sat: { enabled: false, start: "09:00", end: "13:00" },
};

describe("toMinutes", () => {
  it("converts HH:MM to total minutes", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:00")).toBe(540);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("17:00")).toBe(1020);
    expect(toMinutes("23:59")).toBe(1439);
  });
});

describe("fromMinutes", () => {
  it("converts total minutes to HH:MM", () => {
    expect(fromMinutes(0)).toBe("00:00");
    expect(fromMinutes(540)).toBe("09:00");
    expect(fromMinutes(570)).toBe("09:30");
    expect(fromMinutes(1020)).toBe("17:00");
  });

  it("is the inverse of toMinutes", () => {
    expect(fromMinutes(toMinutes("10:45"))).toBe("10:45");
    expect(fromMinutes(toMinutes("08:15"))).toBe("08:15");
  });
});

describe("computeSlots", () => {
  it("returns empty array when day is not enabled", () => {
    expect(computeSlots(SAT, 30, HOURS, [])).toEqual([]);
  });

  it("returns empty array when day has no entry in working hours", () => {
    expect(computeSlots(WED, 30, {}, [])).toEqual([]);
  });

  it("generates correct slots for a full day with no busy ranges", () => {
    const slots = computeSlots(WED, 60, HOURS, []);
    // 09:00–17:00 = 8 hours = 8 × 60-min slots
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ start: "09:00", end: "10:00" });
    expect(slots[7]).toEqual({ start: "16:00", end: "17:00" });
  });

  it("generates 30-min slots correctly", () => {
    const slots = computeSlots(WED, 30, HOURS, []);
    // 8h × 2 = 16 slots
    expect(slots).toHaveLength(16);
    expect(slots[0]).toEqual({ start: "09:00", end: "09:30" });
    expect(slots[1]).toEqual({ start: "09:30", end: "10:00" });
  });

  it("excludes slots that overlap a busy range", () => {
    const busy = [{ start: toMinutes("10:00"), end: toMinutes("11:00") }];
    const slots = computeSlots(WED, 60, HOURS, busy);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("09:00");
    expect(starts).toContain("11:00");
  });

  it("excludes a slot that partially overlaps a busy range at the start", () => {
    // Busy: 09:30–10:30. A 60-min slot starting at 09:00 ends at 10:00, overlapping.
    const busy = [{ start: toMinutes("09:30"), end: toMinutes("10:30") }];
    const slots = computeSlots(WED, 60, HOURS, busy);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("11:00");
  });

  it("excludes a slot that partially overlaps a busy range at the end", () => {
    // Busy: 11:30–12:30. A 60-min slot starting at 11:00 ends at 12:00, overlapping.
    const busy = [{ start: toMinutes("11:30"), end: toMinutes("12:30") }];
    const slots = computeSlots(WED, 60, HOURS, busy);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("11:00");
  });

  it("handles multiple busy ranges", () => {
    const busy = [
      { start: toMinutes("09:00"), end: toMinutes("10:00") },
      { start: toMinutes("12:00"), end: toMinutes("13:00") },
    ];
    const slots = computeSlots(WED, 60, HOURS, busy);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("12:00");
    expect(starts).toContain("10:00");
    expect(starts).toContain("11:00");
    expect(starts).toContain("13:00");
  });

  it("returns empty array when the entire day is blocked", () => {
    const busy = [{ start: toMinutes("09:00"), end: toMinutes("17:00") }];
    expect(computeSlots(WED, 60, HOURS, busy)).toEqual([]);
  });

  it("does not generate a slot that would exceed the day end time", () => {
    // 45-min increments from 09:00: 09:00, 09:45, …, 15:45 (end=16:30), 16:30 would end 17:15 → excluded
    const slots = computeSlots(WED, 45, HOURS, []);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain("16:30"); // 16:30+45=17:15 > 17:00
    // Every slot must end at or before 17:00
    slots.forEach((s) => {
      expect(toMinutes(s.end)).toBeLessThanOrEqual(toMinutes("17:00"));
    });
  });
});

describe("filterPastSlots", () => {
  const TODAY = new Date().toISOString().split("T")[0];
  const FUTURE_DATE = "2099-01-01";
  const slots = [
    { start: "09:00", end: "09:30" },
    { start: "09:30", end: "10:00" },
    { start: "10:00", end: "10:30" },
    { start: "10:30", end: "11:00" },
  ];

  it("returns all slots unchanged for a future date", () => {
    expect(filterPastSlots(slots, FUTURE_DATE, toMinutes("11:00"))).toEqual(slots);
  });

  it("filters out past slots when date is today", () => {
    const nowMins = toMinutes("09:45");  // 9:45 AM
    const result = filterPastSlots(slots, TODAY, nowMins);
    const starts = result.map(s => s.start);
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("09:30");
    expect(starts).toContain("10:00");
    expect(starts).toContain("10:30");
  });

  it("returns empty array when all slots are in the past", () => {
    const nowMins = toMinutes("23:00");
    expect(filterPastSlots(slots, TODAY, nowMins)).toEqual([]);
  });

  it("returns all slots when now is before the first slot", () => {
    const nowMins = toMinutes("08:00");
    expect(filterPastSlots(slots, TODAY, nowMins)).toEqual(slots);
  });

  it("filters strictly (slot start must be AFTER now, not equal)", () => {
    const nowMins = toMinutes("10:00");
    const result = filterPastSlots(slots, TODAY, nowMins);
    // 10:00 start is NOT > 10:00 now, so it should be filtered out
    expect(result.map(s => s.start)).not.toContain("10:00");
    expect(result.map(s => s.start)).toContain("10:30");
  });
});
