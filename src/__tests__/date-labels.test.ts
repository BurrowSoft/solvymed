import { describe, expect, it } from "vitest";
import { formatDateLabel, formatTimeLabel } from "@/lib/dateLabels";

describe("formatDateLabel", () => {
  it("uses the given locale, not the runtime's", () => {
    expect(formatDateLabel("pt-BR", "2026-09-28", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
      .toBe("segunda-feira, 28 de setembro de 2026");
    expect(formatDateLabel("en", "2026-09-28", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
      .toBe("Monday, September 28, 2026");
  });

  it("never shifts the day, whatever the runtime time zone (TZ is São Paulo in tests)", () => {
    expect(formatDateLabel("en", "2026-01-01", { day: "numeric", month: "numeric", year: "numeric" })).toBe("1/1/2026");
    expect(formatDateLabel("en", "2026-12-31", { day: "numeric", month: "numeric", year: "numeric" })).toBe("12/31/2026");
  });

  it("returns the input when it isn't a date", () => {
    expect(formatDateLabel("en", "soon")).toBe("soon");
  });
});

describe("formatTimeLabel", () => {
  it("formats the stored wall-clock time in the locale", () => {
    expect(formatTimeLabel("pt-BR", "09:05:00")).toBe("9:05");
    expect(formatTimeLabel("en", "14:30").replace(/\s/g, " ")).toBe("2:30 PM");
    expect(formatTimeLabel("pt-BR", "00:00")).toBe("0:00");
  });

  it("returns the input when it isn't a time", () => {
    expect(formatTimeLabel("en", "")).toBe("");
  });
});
