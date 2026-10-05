// The dates an Agenda view shows (server side): one day, the Monday–Sunday
// week, or the month's whole weeks (Monday first), as YYYY-MM-DD. The
// server runs in UTC, so a toISOString() day is the calendar day.
export type AgendaView = "list" | "day" | "week" | "month";

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }

export function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekStart(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoDate(d);
}

export function parseView(v: string | undefined): AgendaView {
  return v === "day" || v === "week" || v === "month" ? v : "list";
}

export function viewRange(view: AgendaView, currentDate: string): { start: string; end: string } {
  if (view === "week") {
    const start = weekStart(currentDate);
    return { start, end: addDays(start, 6) };
  }
  if (view === "month") {
    const d = new Date(currentDate + "T12:00:00");
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    const fdow = firstDay.getDay();
    firstDay.setDate(firstDay.getDate() - (fdow === 0 ? 6 : fdow - 1));
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const ldow = lastDay.getDay();
    lastDay.setDate(lastDay.getDate() + (ldow === 0 ? 0 : 7 - ldow));
    return { start: isoDate(firstDay), end: isoDate(lastDay) };
  }
  return { start: currentDate, end: currentDate };
}

// "Todos" (166, UX 6 Oct): the calendar grids are offered only when every
// shown doctor's practice keeps the same time zone; one shared time grid
// would put another zone's visits at the wrong hour (São Paulo vs Manaus).
export function sharedZone(zones: string[]): string | null {
  return zones.length > 0 && zones.every((z) => z === zones[0]) ? zones[0] : null;
}

// "Todos" (166): the day shown. A ?date wins; without one, the shown
// doctors' own today when they share a zone, else her primary's (f0/c6:
// a Manaus chip near midnight must not open on São Paulo's date).
export function todosDay(dateParam: string | null, zone: string | null, primaryToday: string, todayIn: (zone: string) => string): { today: string; currentDate: string } {
  const today = zone ? todayIn(zone) : primaryToday;
  return { today, currentDate: dateParam ?? today };
}
