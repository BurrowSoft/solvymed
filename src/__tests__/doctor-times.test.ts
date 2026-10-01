import { describe, expect, it } from "vitest";
import { doctorTimeChips } from "@/lib/doctorTimes";

// Item 10, the doctor's grid (app #243's rules, e7).
const day = { enabled: true, start: "09:00", end: "18:00" };
const times = (c: { time: string }[]) => c.map((x) => x.time);

describe("doctorTimeChips", () => {
  it("the day's hours in 15-minute steps; ending after closing is greyed", () => {
    const c = doctorTimeChips({ hoursSet: true, day, showOutside: false, duration: 30, taken: [] });
    expect(c[0].time).toBe("09:00");
    expect(c.at(-1)!.time).toBe("17:45");
    expect(c.find((x) => x.time === "17:30")!.outside).toBe(false);
    expect(c.find((x) => x.time === "17:45")!.outside).toBe(true); // 17:45 + 30 > 18:00
  });

  it("show outside: 06:00–22:00, the outside ones greyed", () => {
    const c = doctorTimeChips({ hoursSet: true, day, showOutside: true, duration: 30, taken: [] });
    expect(c[0]).toEqual({ time: "06:00", outside: true, taken: false });
    expect(c.at(-1)!.time).toBe("21:45");
    expect(c.find((x) => x.time === "10:00")!.outside).toBe(false);
  });

  it("no working hours at all: 08:00–18:00, nothing greyed", () => {
    const c = doctorTimeChips({ hoursSet: false, day: undefined, showOutside: false, duration: 30, taken: [] });
    expect(c[0].time).toBe("08:00");
    expect(c.every((x) => !x.outside)).toBe(true);
  });

  it("a day off: everything greyed", () => {
    const c = doctorTimeChips({ hoursSet: true, day: { enabled: false, start: "09:00", end: "18:00" }, showOutside: false, duration: 30, taken: [] });
    expect(c.every((x) => x.outside)).toBe(true);
  });

  it("taken: any overlap with another appointment or a block", () => {
    const c = doctorTimeChips({ hoursSet: true, day, showOutside: false, duration: 30, taken: [{ start: "10:00", end: "10:30" }] });
    expect(times(c.filter((x) => x.taken))).toEqual(["09:45", "10:00", "10:15"]);
  });
});
