import { countryProfile } from './country';

export interface EffectiveSub {
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscription_provider: string | null;
  subscription_id: string | null;
}

export function isAccessAllowed(sub: EffectiveSub | null): boolean {
  if (!sub) return true; // fail-open
  const { subscription_status, trial_ends_at, current_period_end } = sub;
  if (subscription_status === 'lifetime') return true;
  if (subscription_status === 'active') {
    return !current_period_end || new Date(current_period_end) > new Date();
  }
  if (subscription_status === 'trial') {
    return !!trial_ends_at && new Date(trial_ends_at) > new Date();
  }
  return false;
}

// A paid plan that's on: active (within its period) or lifetime. Unlike
// isAccessAllowed, a trial or no row is NOT active (it fails closed), so
// /subscribe?success=1 only says "activated" once the webhook wrote it.
export function isPaidActive(sub: EffectiveSub | null): boolean {
  if (!sub) return false;
  if (sub.subscription_status !== 'active' && sub.subscription_status !== 'lifetime') return false;
  return isAccessAllowed(sub);
}

export function trialDaysRemaining(sub: EffectiveSub | null): number | null {
  if (!sub || sub.subscription_status !== 'trial' || !sub.trial_ends_at) return null;
  const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// A doctor who subscribes during the free trial keeps it (UX, 1 Oct): the
// Stripe subscription starts trialing until trial_ends_at, so nothing is
// charged today and the first charge is when the trial ends. Only with
// more than 48 h left (Stripe needs trial_end ≥ 48 h ahead for Checkout);
// null = charge now, as before.
export const KEEP_TRIAL_MIN_MS = 48 * 60 * 60 * 1000;
export function checkoutTrialEnd(sub: EffectiveSub | null, now = Date.now()): Date | null {
  if (!sub || sub.subscription_status !== 'trial' || !sub.trial_ends_at) return null;
  const end = new Date(sub.trial_ends_at);
  if (!(end.getTime() - now > KEEP_TRIAL_MIN_MS)) return null;
  return end;
}

// A Stripe subscription that dies while the doctor's own trial is still
// running (they subscribed during the trial, then cancelled before it
// ended): back to "trial" until trial_ends_at, never "expired". No extra
// days: the trial end is the original one.
export function statusWhenSubscriptionDies(trialEndsAt: string | null | undefined, now = Date.now()): 'trial' | 'expired' {
  return trialEndsAt && new Date(trialEndsAt).getTime() > now ? 'trial' : 'expired';
}

// What Settings → Assinatura says about the plan: active, lifetime, the
// trial with its days left, or nothing running (ended trial or expired).
export type PlanSummary =
  | { kind: "active" }
  | { kind: "lifetime" }
  | { kind: "trial"; daysLeft: number }
  | { kind: "inactive" };

export function planSummary(sub: EffectiveSub | null): PlanSummary | null {
  if (!sub) return null;
  if (sub.subscription_status === "lifetime") return { kind: "lifetime" };
  if (isPaidActive(sub)) return { kind: "active" };
  const days = trialDaysRemaining(sub);
  if (days !== null && days > 0) return { kind: "trial", daysLeft: days };
  return { kind: "inactive" };
}

/**
 * The monthly price by the PRACTICE's country (Sprint TH, TH-5), never the
 * UI language: Brazil R$ 89, Thailand ฿690, anywhere else US$ 19. Single
 * source for both the displayed price and what Stripe charges (unitAmount,
 * in the currency's minor unit: centavos, satang, cents), so the two can't
 * drift apart.
 */
export type PlanPrice = { amount: string; currency: 'brl' | 'thb' | 'usd'; unitAmount: number };

export function getPlanPrice(country: string | null | undefined): PlanPrice {
  const kind = countryProfile(country).kind;
  if (kind === 'BR') return { amount: 'R$ 89', currency: 'brl', unitAmount: 8900 };
  if (kind === 'TH') return { amount: '฿690', currency: 'thb', unitAmount: 69000 };
  // "US$", not a bare "$": the currency must be unmistakable before the card
  // form (UX), and "$" alone also means other dollars.
  return { amount: 'US$ 19', currency: 'usd', unitAmount: 1900 };
}
