import { cache } from "react";
import { cookies } from "next/headers";
import { createClient as createServerClient, type createClient } from "@/lib/supabase/server";
import { ACTING_COOKIE, type MyPractice } from "@/lib/actingPractice";
import { liveFeatures } from "@/lib/liveFeatures";
import { rowPracticeOverride } from "@/lib/rowPractice";

/**
 * Resolves which professional_id a caller's writes/reads should be scoped
 * to: a secretary acts on behalf of the professional who invited them,
 * everyone else acts on their own id.
 *
 * Returns null for a secretary with no link (the "Not connected" state).
 * Also returns null on a lookup failure — callers must fail closed rather than
 * fall back to userId, which for a secretary would silently scope reads/
 * writes to their own (empty) id instead of the professional they're
 * delegating for.
 */
export async function getEffectiveProfId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  if (data?.role === "secretary") {
    // An unlinked secretary (never accepted, removed, or left) has no
    // practice to act for, never their own id.
    return actingPracticeFor((data.invited_by_professional_id as string | null) ?? null, userId);
  }
  return userId;
}

// The secretary's practices (get_my_practices, migration 163), once per
// request, read WITHOUT the acting header. null on an error.
export const myPractices = cache(async (userId: string): Promise<MyPractice[] | null> => {
  void userId; // the cache key: one list per signed-in user per request
  const supabase = await createServerClient({ acting: false });
  const { data, error } = await supabase.rpc("get_my_practices");
  return error ? null : ((data ?? []) as MyPractice[]);
});

// Which practice a secretary acts for (1.5.0, behind the flag): the doctor
// chosen in the switcher when she still serves them, else her primary.
// The same choice the x-acting-practice header carries, so the ids the
// pages filter by match what the server acts for.
export async function actingPracticeFor(primary: string | null, userId: string): Promise<string | null> {
  if (!liveFeatures.multiPractice || !primary) return primary;
  // A row of the "All" schedule (166): that row's doctor, for this action
  // only; one she doesn't serve acts for no practice (fail closed).
  const row = rowPracticeOverride();
  if (row) {
    if (row === primary) return primary;
    const list = await myPractices(userId);
    return list?.some((p) => p.professional_id === row) ? row : null;
  }
  const chosen = (await cookies()).get(ACTING_COOKIE)?.value;
  if (!chosen || chosen === primary) return primary;
  const list = await myPractices(userId);
  return list?.some((p) => p.professional_id === chosen) ? chosen : primary;
}

/**
 * Whether the caller's persisted role is professional. Returns null on a
 * lookup failure, so callers fail closed. Doctor-only writes (settings,
 * clinics) use this to refuse secretaries, who otherwise pass the
 * auth-only check and would write rows under their own id (e.g. creating
 * a professionals row for a secretary).
 */
export async function isProfessionalRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data?.role === "professional";
}
