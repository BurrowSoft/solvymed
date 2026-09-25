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
 * BRL pricing for Brazilian locale, USD for everyone else. Single source for
 * both the displayed price and what Stripe charges (unitAmount, in the
 * currency's minor unit), so the two can't drift apart.
 */
export function getPlanPrice(locale: string): { amount: string; currency: 'brl' | 'usd'; unitAmount: number } {
  if (locale === 'pt-BR') return { amount: 'R$ 89', currency: 'brl', unitAmount: 8900 };
  return { amount: '$19', currency: 'usd', unitAmount: 1900 };
}
