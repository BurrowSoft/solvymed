import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

// Browser-side Sentry. The DSN is public by design (it only allows sending
// events). Unset locally, so nothing is sent from dev.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...sentryOptions,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
