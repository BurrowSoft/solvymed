import type { SupabaseClient } from "@supabase/supabase-js";
import { serverFlag } from "@/lib/myDoctors";
import { locationFooterLines, sortLocations, type PracticeLocation } from "@/lib/locations";

// 1.8.0 F: a practice's footer location lines for its documents (server
// side): only with the switch on and 2+ locations; [] otherwise or on error.
export async function readLocationLines(supabase: SupabaseClient, professionalId: string): Promise<string[]> {
  if (!(await serverFlag(supabase, "practice_locations"))) return [];
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, address, city, state, phone, is_primary, position, created_at")
    .eq("professional_id", professionalId);
  if (error || !data) return [];
  return locationFooterLines(sortLocations(data as (PracticeLocation & { position?: number; created_at?: string })[]));
}
