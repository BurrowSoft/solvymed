import Stripe from "stripe";
import type { EffectiveSub } from "@/lib/subscription";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

/**
 * The professional's stored Stripe subscription as Stripe reports it now,
 * or null if none is stored. The DB can lag Stripe (it only changes when a
 * webhook lands), and it stores both a failed renewal and an ended trial as
 * plain "expired", so callers that need the truth ask Stripe. Throws on
 * Stripe errors; callers decide whether to fail closed.
 */
export async function retrieveStoredStripeSubscription(sub: EffectiveSub | null): Promise<Stripe.Subscription | null> {
  if (!sub || sub.subscription_provider !== "stripe" || !sub.subscription_id) return null;
  return stripe.subscriptions.retrieve(sub.subscription_id);
}

/** A renewal failed: Stripe is retrying (past_due) or has given up (unpaid). */
export function isPaymentFailed(live: Stripe.Subscription): boolean {
  return live.status === "past_due" || live.status === "unpaid";
}

export async function findUnpaidStripeSubscription(sub: EffectiveSub | null): Promise<Stripe.Subscription | null> {
  const live = await retrieveStoredStripeSubscription(sub);
  return live && isPaymentFailed(live) ? live : null;
}
