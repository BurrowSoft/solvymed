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

// G7 (migration 187): moves the attribution kept with the pending signup
// into signup_attribution (first touch wins, so a cookie row already written
// stays) and deletes the pending row. Never throws: a failure here never
// blocks the redirect.
export async function claimSignupAttribution(supabase: Pick<SupabaseClient, "rpc">): Promise<void> {
  try {
    await supabase.rpc("claim_signup_attribution");
  } catch {
    // Attribution is best-effort.
  }
}
