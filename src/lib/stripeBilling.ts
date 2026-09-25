import Stripe from "stripe";
import type { EffectiveSub } from "@/lib/subscription";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

/**
 * The stored Stripe subscription, if Stripe currently reports it as
 * past_due or unpaid (a renewal failed and Stripe is retrying, or has given
 * up). The DB stores these as plain "expired", which can't tell them apart
 * from an ended trial, so this asks Stripe. Throws on Stripe errors; callers
 * decide whether to fail closed.
 */
export async function findUnpaidStripeSubscription(sub: EffectiveSub | null): Promise<Stripe.Subscription | null> {
  if (!sub || sub.subscription_provider !== "stripe" || !sub.subscription_id) return null;
  const live = await stripe.subscriptions.retrieve(sub.subscription_id);
  return live.status === "past_due" || live.status === "unpaid" ? live : null;
}
