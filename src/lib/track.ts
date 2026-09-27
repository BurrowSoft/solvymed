"use client";

import { redactAnalyticsUrl } from "./analyticsRedact";
import { ANON_ID_KEY, currentConsent } from "./consentClient";

// Product analytics (PostHog, EU). A no-op unless NEXT_PUBLIC_POSTHOG_KEY is
// set AND the visitor accepted analytics. Events are sent straight to
// PostHog's capture API (no SDK, no cookies, no autocapture or session
// recording) with a random anonymous id kept in localStorage, and without a
// person profile. Never put personal data (names, emails, codes, record
// contents) in props; the URL is redacted like Vercel Analytics'.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com").replace(/\/+$/, "");

export type TrackProps = Record<string, string | number | boolean | null>;

export const trackingEnabled = Boolean(KEY);

function anonId(): string | null {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function track(event: string, props: TrackProps = {}) {
  if (!KEY || typeof window === "undefined" || !currentConsent()?.analytics) return;
  const distinctId = anonId();
  if (!distinctId) return;
  const body = {
    api_key: KEY,
    event,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      $current_url: redactAnalyticsUrl(location.href),
      $process_person_profile: false,
      $lib: "solvymed-web",
    },
  };
  fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Analytics never breaks the page.
  });
}
