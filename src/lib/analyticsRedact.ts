// Strips personal data from URLs before they reach Vercel Analytics:
// invite and join codes in paths, invite codes and emails in query strings,
// and the whole fragment (password-reset links carry #access_token=…).
// Returns a same-origin URL string, or null to drop the event if the URL
// can't be parsed.

const CODE_PATHS = [
  // /[locale]/join/secretary/<code> (checked before /join/<code>)
  /^((?:\/[A-Za-z-]+)?\/join\/secretary\/)[^/]+/,
  /^((?:\/[A-Za-z-]+)?\/join\/)[^/]+/,
  /^((?:\/[A-Za-z-]+)?\/invite\/)[^/]+/,
];

const SENSITIVE_PARAMS = ["email", "secretary", "join", "code", "token", "token_hash"];

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
  for (const key of SENSITIVE_PARAMS) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
  }
  url.hash = "";
  return url.toString();
}
