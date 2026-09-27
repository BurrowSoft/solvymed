// First-touch signup attribution: which campaign or site brought a visitor.
// Captured in the browser only with marketing consent, kept in a first-party
// cookie, and written once to signup_attribution (record_signup_attribution)
// after the new account's email is confirmed. Pure functions, shared by the
// browser and the server.

export const ATTRIBUTION_COOKIE = "sm_attr";
// record_signup_attribution ignores a first_seen_at older than 90 days.
export const ATTRIBUTION_MAX_AGE_S = 90 * 24 * 60 * 60;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const MAX_LEN = 200;

export type Attribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  referrer_host?: string;
  landing_path?: string;
  first_seen_at: string;
};

const clip = (s: string) => s.trim().slice(0, MAX_LEN);
const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

// Invite and join codes are credentials: keep the page, not the code (the
// RPC does the same; this keeps them out of the cookie too).
export function redactLandingPath(pathname: string): string {
  return pathname
    .replace(/^((?:\/[A-Za-z-]+)?\/join\/secretary\/)[^/]+/, "$1:code")
    .replace(/^((?:\/[A-Za-z-]+)?\/join\/)(?!secretary\/)[^/]+/, "$1:code")
    .replace(/^((?:\/[A-Za-z-]+)?\/invite\/)[^/]+/, "$1:code")
    .slice(0, MAX_LEN);
}

// The landing page's UTM values, the referring site's host (none for an
// internal or missing referrer), and the path without query or fragment.
export function captureAttribution(input: {
  search: string;
  referrer: string;
  pathname: string;
  ownHost: string;
  nowMs?: number;
}): Attribution {
  const params = new URLSearchParams(input.search);
  const out: Attribution = { first_seen_at: new Date(input.nowMs ?? Date.now()).toISOString() };
  for (const key of UTM_KEYS) {
    const v = clip(params.get(key) ?? "");
    if (v) out[key] = v;
  }
  try {
    const host = new URL(input.referrer).hostname.toLowerCase();
    if (host && bareHost(host) !== bareHost(input.ownHost)) out.referrer_host = host.slice(0, 253);
  } catch {
    // No referrer, or not a URL.
  }
  out.landing_path = redactLandingPath(input.pathname.split(/[?#]/)[0] || "/");
  return out;
}

export function serializeAttribution(a: Attribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

// Only known keys with string values survive; anything else in the cookie
// (it's client-writable) is dropped. Null when unusable.
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.first_seen_at !== "string" || Number.isNaN(Date.parse(obj.first_seen_at))) return null;
  const out: Attribution = { first_seen_at: obj.first_seen_at };
  for (const key of [...UTM_KEYS, "referrer_host", "landing_path"] as const) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) out[key] = clip(v);
  }
  if (out.landing_path) out.landing_path = redactLandingPath(out.landing_path.split(/[?#]/)[0]);
  return out;
}

// The UTM parameters of a page's query, as "&utm_x=…" pairs, for server
// redirects that would otherwise drop them before the banner can read them.
export function utmQuerySuffix(searchParams: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const raw = searchParams[key];
    const v = clip(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
    if (v) out.set(key, v);
  }
  const s = out.toString();
  return s ? `&${s}` : "";
}

// Stored in place of the attribution once it was sent after a signup, so
// the page the user lands on next doesn't capture a new, bogus first touch.
// parseAttribution rejects it, so it's never sent.
export const ATTRIBUTION_SENT = "sent";

// The record_signup_attribution payload.
export function attributionPayload(a: Attribution): Record<string, string> {
  return { ...a, platform: "web" } as Record<string, string>;
}
