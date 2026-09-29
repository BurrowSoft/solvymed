import { getDayHours, toMinutes, type WorkingHours } from "./slots";

// A new or moved appointment outside the practice's working hours is
// allowed, but asked about first ("Agendar mesmo assim?"), on both
// platforms and in SolvyAI (UX 2026-09-28). Never a block. Hours that were
// never set up give no warning.
export type HoursWarning =
  | { kind: "day_off"; day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" }
  | { kind: "outside"; start: string; end: string };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function hoursWarning(
  date: string,
  start: string,
  end: string,
  workingHours: WorkingHours | null | undefined,
): HoursWarning | null {
  if (!workingHours || Object.keys(workingHours).length === 0) return null;
  const day = getDayHours(date, workingHours);
  if (!day?.enabled) return { kind: "day_off", day: DAY_KEYS[new Date(date + "T12:00:00").getDay()] };
  if (toMinutes(start) < toMinutes(day.start) || toMinutes(end) > toMinutes(day.end)) {
    return { kind: "outside", start: day.start.slice(0, 5), end: day.end.slice(0, 5) };
  }
  return null;
}

// The appointments the website can move (Remarcar, UX 36): booked ones.
// Requests are answered on their card; cancelled, rejected, completed and
// absent ones stay where they were; blocked time is removed and re-added.
export const MOVABLE_STATUSES = ["scheduled", "confirmed", "late"];
