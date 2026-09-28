// Dates are stored in the Gregorian calendar ("YYYY-MM-DD"). Thai users
// think in Buddhist-era years (Gregorian + 543), so a typed "2539" for 1996
// (or "2569" for this year) is a likely slip. Such a date is never saved and
// never converted (no guessing): the person fixes it. The same guard as the
// app's, on every typed date (birth dates and the schedule's).
export const BUDDHIST_ERA_OFFSET = 543;
export const BUDDHIST_YEAR_MIN = 2400;

function yearOf(value: string | null | undefined): number | null {
  const m = /^(\d{4,})-\d{2}-\d{2}$/.exec((value ?? "").trim());
  return m ? Number(m[1]) : null;
}

export function looksBuddhistEra(value: string | null | undefined): boolean {
  const y = yearOf(value);
  return y !== null && y >= BUDDHIST_YEAR_MIN;
}

// The Buddhist-era year of a Gregorian date, for the hint under a birth
// date in Thai; null when there's no plausible date to show it for.
export function buddhistYearOf(value: string | null | undefined): number | null {
  const y = yearOf(value);
  return y === null || y >= BUDDHIST_YEAR_MIN ? null : y + BUDDHIST_ERA_OFFSET;
}
