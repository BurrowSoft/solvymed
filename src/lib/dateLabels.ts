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
export function dateLocale(locale: string): string {
  if (locale === "th") return "th-TH-u-ca-buddhist";
  if (locale === "en" || locale.startsWith("en-")) return "en-GB";
  return locale;
}

export function formatDateLabel(
  locale: string,
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return plainSpaces(new Intl.DateTimeFormat(dateLocale(locale), { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12))));
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
    new Intl.DateTimeFormat(dateLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, 0, 1, h, m)),
    ),
  );
}
