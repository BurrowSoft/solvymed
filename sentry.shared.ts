import type { BrowserOptions } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentryScrub";

// Options shared by the browser, Node and Edge Sentry clients. The Sentry
// org is US-hosted, so privacy comes from what's sent: no default PII, no
// Session Replay, and every event and breadcrumb goes through the scrubber
// (src/lib/sentryScrub.ts). Without a DSN (local dev), Sentry stays off.
export const sentryOptions = {
  sendDefaultPii: false,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  // Light performance sampling; transactions are scrubbed too.
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
} satisfies Partial<BrowserOptions>;
