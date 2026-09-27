// Strips personal data from URLs before they reach analytics (and Sentry):
// invite and join codes and record ids in paths, every query value that
// isn't known to be safe, and the whole fragment (password-reset links carry #access_token=…).
// Returns a same-origin URL string, or null to drop the event if the URL
// can't be parsed.

const CODE_PATHS = [
  // /[locale]/join/secretary/<code> (checked before /join/<code>)
  /^((?:\/[A-Za-z-]+)?\/join\/secretary\/)[^/]+/,
  /^((?:\/[A-Za-z-]+)?\/join\/)[^/]+/,
  /^((?:\/[A-Za-z-]+)?\/invite\/)[^/]+/,
];

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

// Query values are redacted unless the key is on this list. An allowlist,
// because params keep appearing that carry personal data (search terms with
// patient names or CPFs, ?next= holding an invite path, emails, codes,
// tokens), and a blocklist misses the next one. Keys stay visible, so the
// route shape is still analysable.
const SAFE_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "date", "week", "view", "tab", "archived", "locale", "country",
]);

export function redactAnalyticsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  for (const re of CODE_PATHS) {
    if (re.test(url.pathname)) {
      url.pathname = url.pathname.replace(re, "$1[code]");
      break;
    }
  }
  // Record ids (patients, appointments, professionals) say whose page it is.
  url.pathname = url.pathname.replace(UUID_SEGMENT, "/[id]");
  for (const key of new Set(url.searchParams.keys())) {
    if (!SAFE_PARAMS.has(key)) url.searchParams.set(key, "[redacted]");
  }
  url.hash = "";
  return url.toString();
}
