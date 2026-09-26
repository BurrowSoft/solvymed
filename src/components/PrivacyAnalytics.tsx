"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/analyticsRedact";

// Vercel Analytics with personal data stripped from every reported URL
// (invite and join codes, emails, reset tokens in the fragment). beforeSend
// needs a function, so this lives in a client component.
export function PrivacyAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = redactAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
