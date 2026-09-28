import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCountry } from "./country";

// The practice's country (professionals.country, migration 110). The doctor
// reads their own row; a secretary can't (RLS) and gets it from
// get_my_clinic(). Never throws: before 110 is applied (no column/field) or
// on any error it's 'BR', which is what every practice was until then.
export async function getPracticeCountry(
  supabase: Pick<SupabaseClient, "from" | "rpc">,
  userId: string,
  effectiveProfId: string,
): Promise<string> {
  try {
    if (userId === effectiveProfId) {
      const { data, error } = await supabase.from("professionals").select("country").eq("id", userId).maybeSingle();
      if (!error && data && typeof (data as { country?: unknown }).country === "string") {
        return normalizeCountry((data as { country: string }).country);
      }
      return "BR";
    }
    const { data, error } = await supabase.rpc("get_my_clinic");
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row && typeof (row as { country?: unknown }).country === "string") {
      return normalizeCountry((row as { country: string }).country);
    }
  } catch {
    // Fall through to BR.
  }
  return "BR";
}
