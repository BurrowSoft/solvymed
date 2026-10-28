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
