"use server";

import { createClient } from "@/lib/supabase/server";
import { isPaidActive, type EffectiveSub } from "@/lib/subscription";

// Whether the signed-in doctor's subscription is active in the database
// (the Stripe webhook writes it). /subscribe?success=1 polls this before
// saying "Assinatura ativada!": coming back from checkout only means Stripe
// took the payment, not that the plan is on.
export async function isSubscriptionActive(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  if (error) return false;
  return isPaidActive((data?.[0] ?? null) as EffectiveSub | null);
}
