import Stripe from "stripe";
import type { EffectiveSub } from "@/lib/subscription";

// Built on first use, not when the module loads: Next collects route data
// at build time, and a client built then without STRIPE_SECRET_KEY (a
// Preview without the test key) failed the whole build. A missing key now
// fails only the Stripe call that needs it, at request time.
let client: Stripe | null = null;
export function getStripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
  return client;
}
export const stripe: Stripe = new Proxy({} as Stripe, {
  get: (_target, key) => Reflect.get(getStripe(), key),
});

// Stripe's page in the doctor's language: every app locale Stripe has, the
// rest (Arabic) on "auto" (the browser's language).
const STRIPE_LOCALES = new Set(["pt-BR", "en", "es", "fr", "de", "it", "th", "id", "ja", "ko", "ru", "vi", "zh", "zh-TW"]);
export function stripeLocale(appLocale: string): Stripe.BillingPortal.SessionCreateParams.Locale {
  return (STRIPE_LOCALES.has(appLocale) ? appLocale : "auto") as Stripe.BillingPortal.SessionCreateParams.Locale;
}

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
