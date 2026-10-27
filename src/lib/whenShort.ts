import { dateLocale, plainSpaces, type DateCalendar } from "@/lib/dateLabels";

// One short date-and-time for the staff's lists (launch polish 32: the inbox said "27 de out.,
// 02:11" and the access log "27 de out. de 2026, 02:13"): day, short month and time, with the
// year only when it isn't this year (in the same zone), in the reader's locale and calendar
// (dateLocale: Thai shows the Buddhist-era year).
export function whenShortFormatter(locale: string, calendar?: DateCalendar, timeZone?: string): (iso: string) => string {
  const base = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) } as const;
  const thisYear = new Intl.DateTimeFormat(dateLocale(locale, calendar), base);
  const otherYear = new Intl.DateTimeFormat(dateLocale(locale, calendar), { ...base, year: "numeric" });
  // "This year" compares Gregorian years in the zone (a machine value, never shown).
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", ...(timeZone ? { timeZone } : {}) });
  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const same = year.format(d) === year.format(new Date());
    return plainSpaces((same ? thisYear : otherYear).format(d));
  };
}
