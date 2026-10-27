import { dateLocale } from "@/lib/dateLabels";

// The doctor's reading hours for the patient's "Horário" tile (launch polish 20): one line per
// row, the days with consecutive ones joined ("seg.–sex."), then the times ("08:00–18:00"), in the
// reader's language. Days are 1 = Monday … 7 = Sunday (237). Malformed rows are skipped.
export type ReadingHoursRow = { days: number[]; from: string; to: string };

export function toReadingHours(raw: unknown): ReadingHoursRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const days = Array.isArray(o.days) ? o.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7) : [];
    const from = typeof o.from === "string" && /^\d{2}:\d{2}$/.test(o.from) ? o.from : null;
    const to = typeof o.to === "string" && /^\d{2}:\d{2}$/.test(o.to) ? o.to : null;
    return days.length && from && to ? [{ days: [...new Set(days)].sort((a, b) => a - b), from, to }] : [];
  });
}

export function readingHoursLines(rows: ReadingHoursRow[], locale: string): string[] {
  // Mon = 1 … Sun = 7: 2024-01-01 was a Monday.
  const f = new Intl.DateTimeFormat(dateLocale(locale), { weekday: "short", timeZone: "UTC" });
  const day = (n: number) => f.format(new Date(Date.UTC(2024, 0, n)));
  return rows.map((r) => {
    const runs: number[][] = [];
    for (const d of r.days) {
      const last = runs[runs.length - 1];
      if (last && d === last[last.length - 1] + 1) last.push(d);
      else runs.push([d]);
    }
    const days = runs.map((run) => (run.length >= 3 ? `${day(run[0])}–${day(run[run.length - 1])}` : run.map(day).join(", "))).join(", ");
    return `${days} · ${r.from}–${r.to}`;
  });
}
