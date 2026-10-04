// Labels for stored calendar dates ("YYYY-MM-DD") and clock times ("HH:MM",
// "HH:MM:SS"), in the page's language. Formatted in UTC from fixed UTC
// instants, so the server render and the browser produce the same text
// (no hydration mismatch) and the day or hour can't shift with the
// runtime's time zone. Never pass `undefined` as the locale: the server's
// default (en-US) then differs from the visitor's browser.

// ICU versions differ in the spaces they emit: Node's puts thin spaces
// (U+2009) around the en dash of a date range where Chrome uses plain ones,
// and the space before AM/PM is U+202F in some versions. Same look,
// different text, so hydration fails. Every label goes through this.
export function plainSpaces(s: string): string {
  return s.replace(/[\u00a0\u2009\u202f]/g, " ");
}

// The locale every date formatter uses. Thai dates show the Buddhist year
// (Sprint TH), which "th" only gives where the runtime's default calendar
// for it is Buddhist (Node's is; some browsers/devices use Gregorian), so
// it's requested explicitly. Stored dates stay Gregorian.
// English is British-style (Vitor, build 25: "English ≠ American"): day
// before month, never MM/DD, and a 24-hour clock like BR/TH.
// calendar: a practice country's (patient screens, Q4 2 Oct: a BR clinic's
// dates are Gregorian and a TH clinic's Buddhist, whatever the language);
// omitted, the language's own (Thai → Buddhist).
export type DateCalendar = "gregorian" | "buddhist";
export function dateLocale(locale: string, calendar?: DateCalendar): string {
  const base = locale === "th" ? "th-TH" : locale === "en" || locale.startsWith("en-") ? "en-GB" : locale;
  const ca = calendar ?? (locale === "th" ? "buddhist" : undefined);
  return ca ? `${base}-u-ca-${ca === "buddhist" ? "buddhist" : "gregory"}` : base;
}

export function formatDateLabel(
  locale: string,
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
  calendar?: DateCalendar,
): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const parts = new Intl.DateTimeFormat(dateLocale(locale, calendar), { ...options, timeZone: "UTC" }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  // No era: a Thai clinic's year reads "2569" in every language, as in the
  // app and the printed documents (UX, 5 Oct: never "2569 BE" in pt/en).
  const kept = parts.filter((p, i) => p.type !== "era" && !(p.type === "literal" && parts[i + 1]?.type === "era"));
  return plainSpaces(kept.map((p) => p.value).join(""));
}

// The locale's short numeric date, like the app: 14/05/1993 (pt-BR and en:
// never MM/DD), 14/05/2536 (th, Buddhist year).
export function formatShortDate(locale: string, date: string): string {
  return formatDateLabel(locale, date, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatTimeLabel(locale: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time;
  return plainSpaces(
    new Intl.DateTimeFormat(dateLocale(locale), { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, 0, 1, h, m)),
    ),
  );
}
