// A recurring series (the app's recurrenceDates, the same dates on both
// platforms): the first date, then every week / 2 weeks / month, `count`
// dates in all. Monthly steps keep the day number and roll over like the
// app does (31 Jan → 3 Mar in a non-leap year).
export type Recurrence = "weekly" | "biweekly" | "monthly";
export const RECURRENCES: Recurrence[] = ["weekly", "biweekly", "monthly"];
export const MIN_OCCURRENCES = 2;
export const MAX_OCCURRENCES = 52;
export const DEFAULT_OCCURRENCES = 8;

const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function recurrenceDates(startDate: string, recurrence: Recurrence, count: number): string[] {
  const [yr, mo, dy] = startDate.split("-").map(Number);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = recurrence === "weekly" ? new Date(Date.UTC(yr, mo - 1, dy + i * 7))
      : recurrence === "biweekly" ? new Date(Date.UTC(yr, mo - 1, dy + i * 14))
        : new Date(Date.UTC(yr, mo - 1 + i, dy));
    dates.push(key(d));
  }
  return dates;
}
