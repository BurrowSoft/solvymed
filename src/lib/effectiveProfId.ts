import type { createClient } from "@/lib/supabase/server";

/**
 * Resolves which professional_id a caller's writes/reads should be scoped
 * to: a secretary acts on behalf of the professional who invited them,
 * everyone else acts on their own id.
 *
 * Returns null on a lookup failure — callers must fail closed rather than
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
  if (data?.role === "secretary" && data?.invited_by_professional_id) {
    return data.invited_by_professional_id as string;
  }
  return userId;
}
