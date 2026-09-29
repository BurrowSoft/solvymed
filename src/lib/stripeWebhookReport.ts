import * as Sentry from "@sentry/nextjs";

// Stripe webhook failures our route can see, sent to Sentry so a failing
// webhook is noticed (5 checkouts went unactivated for days with nothing
// logged). Only the reason and the Stripe event's type and id: never the
// payload, customer, email or amounts. A redirect or an unreachable URL
// never reaches the route; Stripe's own alerts cover those.
export type WebhookFailure =
  | "bad_signature" // wrong STRIPE_WEBHOOK_SECRET (e.g. after a new endpoint)
  | "sync_failed" // syncSubscription answered 5xx (Stripe will retry)
  | "handler_threw"
  | "no_professional_row"; // an active subscription matched no row

export async function reportWebhookFailure(reason: WebhookFailure, event?: { id: string; type: string }) {
  Sentry.captureMessage(`Stripe webhook: ${reason}`, {
    level: "error",
    fingerprint: ["stripe-webhook", reason],
    tags: {
      stripe_webhook_failure: reason,
      ...(event ? { stripe_event_type: event.type, stripe_event_id: event.id } : {}),
    },
  });
  // Serverless: send before the function freezes. Never blocks for long.
  await Sentry.flush(2000).catch(() => false);
}
