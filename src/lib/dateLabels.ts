// Labels for stored calendar dates ("YYYY-MM-DD") and clock times ("HH:MM",
// "HH:MM:SS"), in the page's language. Formatted in UTC from fixed UTC
// instants, so the server render and the browser produce the same text
// (no hydration mismatch) and the day or hour can't shift with the
// runtime's time zone. Never pass `undefined` as the locale: the server's
// default (en-US) then differs from the visitor's browser.

export function formatDateLabel(
  locale: string,
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatTimeLabel(locale: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}
