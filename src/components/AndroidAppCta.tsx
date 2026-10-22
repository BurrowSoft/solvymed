"use client";

import { androidStoreLink, playStoreUrl, playStoreUrlForVisit, type VisitUtm } from "@/lib/appStores";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/lib/attribution";
import { currentConsent, readCookie } from "@/lib/consentClient";
import { COUNTRY_STEP } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { SignupCta } from "./SignupCta";

// Funnel F5 (Vitor, 10-20): on an Android phone the landing's first CTA is
// Google Play, with "or continue on the website" to the signup. Hidden
// unless the inline platform script marked <html> (globals.css
// .android-only), so other devices, and pages without JS, keep the
// signup CTA (wrapped in .android-hide) as before.

// The visit's campaign for the Play referrer, read at the click: the first
// touch (the marketing cookie), else this page's utm; only with marketing
// consent (privacy §3.6).
function consentedVisit(): VisitUtm | null {
  if (!currentConsent()?.marketing) return null;
  const first = parseAttribution(readCookie(ATTRIBUTION_COOKIE));
  if (first?.utm_source || first?.utm_campaign) return first;
  const q = new URLSearchParams(location.search);
  return { utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign") };
}

export function AndroidAppCta({
  locale,
  label,
  webLabel,
  className,
  webClassName,
}: {
  locale: string;
  label: string;
  webLabel: string;
  className: string;
  webClassName: string;
}) {
  return (
    <div className="android-only flex-col items-center gap-3" data-testid="android-app-cta">
      <a
        href={playStoreUrl("landing")}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="android-app-cta-play"
        className={className}
        onClick={(e) => {
          // The Play Store app (an intent; the website as its fallback), in
          // this tab: a new tab would be left blank behind the store (01).
          e.currentTarget.href = androidStoreLink(playStoreUrlForVisit("landing", consentedVisit()));
          e.currentTarget.target = "_self";
          track("app_store_click", { platform: "android", c: COUNTRY_STEP.find((s) => s.locale === locale)?.code ?? null });
        }}
      >
        {label}
      </a>
      <SignupCta label={webLabel} className={webClassName} />
    </div>
  );
}
