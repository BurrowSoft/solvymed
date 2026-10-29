// The sign-up funnel's fixes (specs/signup-funnel-fixes.md; 01's GO, 10-28), the parts
// the browser and the server share.

// Daily totals the server counts (the mobile developer's auth_funnel_count_server:
// (UTC day, country, locale, metric) → n, no account, IP or device id; a no-op while
// server_flags.auth_funnel_metrics is off). The verify page may report only these; the
// callback reports google_exchange_failed itself.
export const VERIFY_METRICS = ["verify_view", "verify_continue_ok", "verify_expired", "verify_resend"] as const;
export type VerifyMetric = (typeof VERIFY_METRICS)[number];
export type FunnelMetric = VerifyMetric | "google_exchange_failed";

export function isVerifyMetric(v: unknown): v is VerifyMetric {
  return typeof v === "string" && (VERIFY_METRICS as readonly string[]).includes(v);
}

// Where a count comes from (the contract's platform column, 01: platform parity). The
// app's confirm panel reports through the website's route with "android" / "ios";
// anything else is the website. Self-reported, so the totals are approximate.
export type FunnelPlatform = "web" | "android" | "ios";

export function funnelPlatform(v: unknown): FunnelPlatform {
  return v === "android" || v === "ios" ? v : "web";
}

// A per-IP limit on the unauthenticated counting route (cf's item 6): enough for a
// person's confirm screen, not for inflating the totals. In this server instance's
// memory (best effort; each instance counts on its own).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

export function allowFunnelCount(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((at) => now - at < WINDOW_MS)) hits.delete(key);
  }
  return true;
}

// Tests only.
export function resetFunnelLimit() {
  hits.clear();
}

// The login page's line after a Google round trip that didn't finish (the callback's
// ?google=failed).
export const GOOGLE_FAILED_PARAM = "google";
export const GOOGLE_FAILED_VALUE = "failed";

// Google refuses sign-in inside an app's own browser (its "disallowed_useragent" error):
// Instagram, Facebook and LINE (the usual one in Thailand; 01). Those show "Abra no
// navegador" instead of the Google button.
const IN_APP = /\bInstagram\b|FBAN\/|FBAV\/|FB_IAB|FBIOS|\bLine\//;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return IN_APP.test(userAgent ?? "");
}
