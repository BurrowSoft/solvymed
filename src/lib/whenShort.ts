import { plainSpaces } from "@/lib/dateLabels";

// One short date-and-time for the staff's lists (launch polish 32: the inbox said "27 de out.,
// 02:11" and the access log "27 de out. de 2026, 02:13"): day, short month and time, with the
// year only when it isn't this year (in the same zone), in the reader's locale and calendar.
export function whenShortFormatter(intlLocale: string, timeZone?: string): (iso: string) => string {
  const base = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) } as const;
  const thisYear = new Intl.DateTimeFormat(intlLocale, base);
  const otherYear = new Intl.DateTimeFormat(intlLocale, { ...base, year: "numeric" });
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", ...(timeZone ? { timeZone } : {}) });
  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const same = year.format(d) === year.format(new Date());
    return plainSpaces((same ? thisYear : otherYear).format(d));
  };
}
