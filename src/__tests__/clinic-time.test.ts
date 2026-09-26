import { describe, it, expect } from "vitest";
import { addDays, clinicDate, clinicHour, clinicTime, getClinicTimeZone, previousMonthRange, weekday, weekRange } from "@/lib/clinicTime";

// 23:30 on 2026-09-26 in São Paulo (UTC-3) is 02:30 on the 27th in UTC.
const lateEveningBrazil = new Date("2026-09-27T02:30:00Z");

describe("getClinicTimeZone", () => {
  const reader = (row: unknown, error: unknown = null, rpcRow: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }),
    rpc: async () => ({ data: rpcRow, error }),
  });

  it("reads the doctor's own time zone", async () => {
    expect(await getClinicTimeZone(reader({ time_zone: "America/Manaus" }), { professionalId: "d1", isSecretary: false }))
      .toBe("America/Manaus");
  });

  it("reads a secretary's practice zone through get_my_clinic", async () => {
    expect(await getClinicTimeZone(reader(null, null, [{ time_zone: "America/Recife" }]), { professionalId: "d1", isSecretary: true }))
      .toBe("America/Recife");
  });

  it("falls back to São Paulo before migration 099 (missing column) or on bad data", async () => {
    const missingColumn = { code: "42703", message: 'column professionals.time_zone does not exist' };
    expect(await getClinicTimeZone(reader(null, missingColumn), { professionalId: "d1", isSecretary: false }))
      .toBe("America/Sao_Paulo");
    expect(await getClinicTimeZone(reader({ time_zone: "Mars/Olympus" }), { professionalId: "d1", isSecretary: false }))
      .toBe("America/Sao_Paulo");
    expect(await getClinicTimeZone(reader(null, null, [{}]), { professionalId: "d1", isSecretary: true }))
      .toBe("America/Sao_Paulo");
  });
});

describe("clinicTime", () => {
  it("gives the practice's date and time, not UTC's", () => {
    expect(clinicDate(lateEveningBrazil)).toBe("2026-09-26");
    expect(clinicTime(lateEveningBrazil)).toBe("23:30");
    expect(clinicHour(lateEveningBrazil)).toBe(23);
  });

  it("uses another zone when the practice has one", () => {
    expect(clinicDate(lateEveningBrazil, "Asia/Bangkok")).toBe("2026-09-27");
    expect(clinicTime(lateEveningBrazil, "Asia/Bangkok")).toBe("09:30");
  });

  it("falls back to São Paulo for a missing or invalid zone", () => {
    expect(clinicDate(lateEveningBrazil, null)).toBe("2026-09-26");
    expect(clinicDate(lateEveningBrazil, "Not/AZone")).toBe("2026-09-26");
  });

  it("just after midnight in Brazil is the new day (00:30 BRT = 03:30 UTC)", () => {
    const d = new Date("2026-09-27T03:30:00Z");
    expect(clinicDate(d)).toBe("2026-09-27");
    expect(clinicTime(d)).toBe("00:30");
    expect(clinicHour(d)).toBe(0);
  });

  it("shows midnight as 00, not 24", () => {
    expect(clinicTime(new Date("2026-09-27T03:05:00Z"))).toBe("00:05");
  });

  it("does calendar arithmetic on date strings", () => {
    expect(addDays("2026-09-26", 7)).toBe("2026-10-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekday("2026-09-26")).toBe(6); // Saturday
  });

  it("gives Monday to Sunday, including on a Sunday", () => {
    expect(weekRange("2026-09-26")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // Saturday
    expect(weekRange("2026-09-27")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // Sunday
    expect(weekRange("2026-09-28")).toEqual({ from: "2026-09-28", to: "2026-10-04" }); // Monday
  });

  it("gives the previous month, across a year boundary", () => {
    expect(previousMonthRange("2026-09-26")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(previousMonthRange("2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousMonthRange("2028-03-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
