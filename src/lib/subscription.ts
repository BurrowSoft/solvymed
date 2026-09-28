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

export function trialDaysRemaining(sub: EffectiveSub | null): number | null {
  if (!sub || sub.subscription_status !== 'trial' || !sub.trial_ends_at) return null;
  const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
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
