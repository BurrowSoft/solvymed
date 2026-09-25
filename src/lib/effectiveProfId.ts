import type { createClient } from "@/lib/supabase/server";

/**
 * Resolves which professional_id a caller's writes/reads should be scoped
 * to: a secretary acts on behalf of the professional who invited them,
 * everyone else acts on their own id.
 */
export async function getEffectiveProfId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role === "secretary" && data?.invited_by_professional_id) {
    return data.invited_by_professional_id as string;
  }
  return userId;
}
