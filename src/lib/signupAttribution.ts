import { ATTRIBUTION_COOKIE, parseAttribution } from "./attribution";
import { currentConsent, readCookie } from "./consentClient";

// G7 (cf; migration 187): the first-touch campaign also goes with the signup
// itself, so it's recorded even when the confirmation link is opened in
// another browser (no sm_attr cookie there). Same fields and the same consent
// rule as the cookie path: only with marketing consent and a first touch to
// send. The database moves it out of the account's metadata at once
// (signup_attribution_pending) and claims it at confirmation.
export function signupAttributionMetadata(): { signup_attr?: Record<string, string> } {
  if (!currentConsent()?.marketing) return {};
  const a = parseAttribution(readCookie(ATTRIBUTION_COOKIE));
  if (!a) return {};
  return { signup_attr: { ...a } as Record<string, string> };
}
