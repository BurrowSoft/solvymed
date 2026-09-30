import type { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId, isProfessionalRole } from "@/lib/effectiveProfId";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The dashboard's paywall for server actions. The (gated) layout only stops
// a locked account from RENDERING the pages; an action can still be called
// directly (its id is in the client bundle). The gated pages' actions use
// these instead of getEffectiveProfId / isProfessionalRole, so a locked
// doctor (or their secretary) can't write there either. Settings' actions
// keep the plain ones: a locked doctor still reaches Settings (Help K4).

/**
 * Whether the caller's practice subscription locks them out, by the same
 * rule as the dashboard layout (get_effective_subscription resolves a
 * secretary to her doctor's plan). No row or a failed lookup is not a lock,
 * the layout's fail-open: this is the paywall, not a data boundary (RLS is).
 */
export async function isLockedOut(supabase: Supabase, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_effective_subscription", { p_user_id: userId });
  if (error) return false;
  const sub = ((data as EffectiveSub[] | null)?.[0] ?? null);
  return !!sub && !isAccessAllowed(sub);
}

/** getEffectiveProfId, but null while the practice is locked out. */
export async function getActiveProfId(supabase: Supabase, userId: string): Promise<string | null> {
  const [locked, profId] = await Promise.all([isLockedOut(supabase, userId), getEffectiveProfId(supabase, userId)]);
  return locked ? null : profId;
}

/** isProfessionalRole, but false while the doctor is locked out. */
export async function isActiveProfessional(supabase: Supabase, userId: string): Promise<boolean | null> {
  const [locked, isProf] = await Promise.all([isLockedOut(supabase, userId), isProfessionalRole(supabase, userId)]);
  return locked ? false : isProf;
}
