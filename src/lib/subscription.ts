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

/** BRL pricing for Brazilian locale, USD for everyone else */
export function getPlanPrice(locale: string): { amount: string; currency: string; provider: 'asaas' | 'stripe' } {
  if (locale === 'pt-BR') return { amount: 'R$ 89', currency: 'BRL', provider: 'asaas' };
  return { amount: '$19', currency: 'USD', provider: 'stripe' };
}
