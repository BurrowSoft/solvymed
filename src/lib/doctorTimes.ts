// The doctor's time chips (item 10, the same as app #243): 15-minute steps.
// - Normal view: the day's working hours (08:00–18:00 when the practice has
//   none set at all); "show outside" widens to 06:00–22:00.
// - Greyed but pickable (the save asks to confirm): a start outside the
//   hours, or one whose appointment would end after closing; on a day off,
//   everything. With no working hours set at all, nothing is greyed.
// - Taken (another appointment or blocked time overlaps): marked, pickable
//   (the save warns about the overlap).
export const STEP_MIN = 15;
const DEFAULT_RANGE = { start: 8 * 60, end: 18 * 60 };
const WIDE_RANGE = { start: 6 * 60, end: 22 * 60 };

export type DayHours = { enabled: boolean; start: string; end: string } | null | undefined;
export type TimeChip = { time: string; outside: boolean; taken: boolean };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function doctorTimeChips(opts: {
  hoursSet: boolean;            // the practice has any working hours at all
  day: DayHours;                // this date's hours (undefined/disabled = a day off)
  showOutside: boolean;
  duration: number;             // minutes
  taken: readonly { start: string; end: string }[];
}): TimeChip[] {
  const { hoursSet, day, showOutside, taken } = opts;
  const duration = Math.max(STEP_MIN, Math.round(opts.duration) || 30);
  const open = hoursSet && day?.enabled ? { start: toMin(day.start), end: toMin(day.end) } : null;
  const base = open ?? DEFAULT_RANGE;
  const range = showOutside ? { start: Math.min(WIDE_RANGE.start, base.start), end: Math.max(WIDE_RANGE.end, base.end) } : base;
  const busy = taken.map((r) => ({ start: toMin(r.start), end: toMin(r.end) }));
  const chips: TimeChip[] = [];
  for (let s = Math.ceil(range.start / STEP_MIN) * STEP_MIN; s < range.end; s += STEP_MIN) {
    const e = s + duration;
    const outside = !hoursSet ? false : !open ? true : s < open.start || e > open.end;
    chips.push({ time: toHHMM(s), outside, taken: busy.some((b) => s < b.end && e > b.start) });
  }
  return chips;
}
