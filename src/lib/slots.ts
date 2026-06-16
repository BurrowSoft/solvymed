export type WorkingDayHours = { enabled: boolean; start: string; end: string };
export type WorkingHours = Record<string, WorkingDayHours>;
export type TimeSlot = { start: string; end: string };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function filterPastSlots(slots: TimeSlot[], date: string, nowMinutes: number): TimeSlot[] {
  const today = new Date().toISOString().split("T")[0];
  if (date !== today) return slots;
  return slots.filter(s => toMinutes(s.start) > nowMinutes);
}

export function computeSlots(
  date: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  busyRanges: Array<{ start: number; end: number }>,
): TimeSlot[] {
  const dayKey = DAY_KEYS[new Date(date + "T12:00:00").getDay()];
  const dayHours = workingHours[dayKey];
  if (!dayHours?.enabled) return [];

  const dayStart = toMinutes(dayHours.start);
  const dayEnd = toMinutes(dayHours.end);

  const slots: TimeSlot[] = [];
  let cursor = dayStart;
  while (cursor + durationMinutes <= dayEnd) {
    const slotEnd = cursor + durationMinutes;
    if (!busyRanges.some((r) => cursor < r.end && slotEnd > r.start)) {
      slots.push({ start: fromMinutes(cursor), end: fromMinutes(slotEnd) });
    }
    cursor += durationMinutes;
  }
  return slots;
}
