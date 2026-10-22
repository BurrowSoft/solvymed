import type { VisitUtm } from "./appStores";
import { ATTRIBUTION_COOKIE, parseAttribution } from "./attribution";
import { currentConsent, readCookie } from "./consentClient";

// The visit's campaign for a Play referrer, read at the click: the first
// touch (the marketing cookie), else this page's utm; only with marketing
// consent (privacy §3.6). Shared by the landing's Play CTA (F5) and the
// demo's Android chip.
export function consentedVisit(): VisitUtm | null {
  if (!currentConsent()?.marketing) return null;
  const first = parseAttribution(readCookie(ATTRIBUTION_COOKIE));
  if (first?.utm_source || first?.utm_campaign) return first;
  const q = new URLSearchParams(location.search);
  return { utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign") };
}
