import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTRIBUTION_COOKIE, attributionPayload, parseAttribution } from "./attribution";
import { CONSENT_COOKIE, parseConsent } from "./consent";

type CookieReader = { get(name: string): { value: string } | undefined };

// After a signup confirmation (the user clicked Continue and verifyOtp
// succeeded), stores the first-touch attribution captured in this browser,
// if the visitor still consents to marketing. record_signup_attribution
// keeps only the first row per account and ignores calls outside its window
// (within an hour of signup or of email confirmation). Returns whether the
// cookie was sent, so the caller can delete it; never throws, so a failure
// here never blocks the redirect.
export async function recordSignupAttribution(
  supabase: Pick<SupabaseClient, "rpc">,
  cookies: CookieReader,
): Promise<boolean> {
  if (!parseConsent(cookies.get(CONSENT_COOKIE)?.value)?.marketing) return false;
  const attribution = parseAttribution(cookies.get(ATTRIBUTION_COOKIE)?.value);
  if (!attribution) return false;
  try {
    await supabase.rpc("record_signup_attribution", { p: attributionPayload(attribution) });
  } catch {
    // Attribution is best-effort.
  }
  return true;
}
