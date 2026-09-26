"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/analyticsRedact";

// Module-level, so it's one stable function across renders.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = redactAnalyticsUrl(event.url);
  return url ? { ...event, url } : null;
}

// Vercel Analytics with personal data stripped from every reported URL
// (invite and join codes, query values, reset tokens in the fragment).
// beforeSend needs a function, so this lives in a client component.
export function PrivacyAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
