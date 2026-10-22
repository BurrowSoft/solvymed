"use client";

import { isAndroidWebView, playStoreUrl, playStoreUrlForVisit, storeLinkForAgent } from "@/lib/appStores";
import { consentedVisit } from "@/lib/consentedVisit";
import { COUNTRY_STEP } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { SignupCta } from "./SignupCta";

// Funnel F5 (Vitor, 10-20): on an Android phone the landing's first CTA is
// Google Play, with "or continue on the website" to the signup. Hidden
// unless the inline platform script marked <html> (globals.css
// .android-only), so other devices, and pages without JS, keep the
// signup CTA (wrapped in .android-hide) as before.

// The visit's campaign for the Play referrer: lib/consentedVisit.

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
          // this tab: a new tab would be left blank behind the store (01). A
          // plain WebView keeps the https link, as before (cf).
          e.currentTarget.href = storeLinkForAgent(navigator.userAgent, playStoreUrlForVisit("landing", consentedVisit()));
          if (!isAndroidWebView(navigator.userAgent)) e.currentTarget.target = "_self";
          track("app_store_click", { platform: "android", c: COUNTRY_STEP.find((s) => s.locale === locale)?.code ?? null });
        }}
      >
        {label}
      </a>
      <SignupCta label={webLabel} className={webClassName} />
    </div>
  );
}
