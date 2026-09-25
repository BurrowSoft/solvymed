import Stripe from "stripe";
import type { EffectiveSub } from "@/lib/subscription";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

/**
 * Retrieves a subscription by id, returning null when Stripe says it
 * doesn't exist (resource_missing). That's not a transient error: e.g. an
 * id written with test keys is unknown under live keys, and treating it as
 * a failure would lock the professional out of checkout and the portal
 * forever. Every other Stripe error still throws, so callers fail closed.
 */
export async function retrieveSubscriptionOrNull(id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") return null;
    throw err;
  }
}

/**
 * The professional's stored Stripe subscription as Stripe reports it now,
 * or null if none is stored (or Stripe doesn't know the stored id). The DB
 * lags Stripe (it only changes when a webhook lands), and it stores both a
 * failed renewal and an ended trial as plain "expired", so callers that
 * need the truth ask Stripe.
 */
export async function retrieveStoredStripeSubscription(sub: EffectiveSub | null): Promise<Stripe.Subscription | null> {
  if (!sub || sub.subscription_provider !== "stripe" || !sub.subscription_id) return null;
  return retrieveSubscriptionOrNull(sub.subscription_id);
}

export function isLive(live: Stripe.Subscription): boolean {
  return live.status === "active" || live.status === "trialing";
}

/**
 * Stripe still holds this subscription and may yet collect on it (past_due,
 * unpaid, incomplete, paused), but it isn't granting access. The fix is the
 * card on this subscription (the Customer Portal), never a second
 * subscription. Only canceled / incomplete_expired are terminal.
 */
export function needsCardFix(live: Stripe.Subscription): boolean {
  return !isLive(live) && live.status !== "canceled" && live.status !== "incomplete_expired";
}

export async function findUnpaidStripeSubscription(sub: EffectiveSub | null): Promise<Stripe.Subscription | null> {
  const live = await retrieveStoredStripeSubscription(sub);
  return live && needsCardFix(live) ? live : null;
}
