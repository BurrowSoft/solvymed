import type { SupabaseClient } from "@supabase/supabase-js";

// "Always say who" in patient pushes (Vitor, build 25; app #290): the
// practice doctor's name as set (with the title they typed, e.g. "Dra. Ana
// Souza"), else the clinic's name, else "SolvyMed": never empty.
export async function doctorForPush(db: SupabaseClient, practiceId: string | null | undefined): Promise<string> {
  if (!practiceId) return "SolvyMed";
  try {
    const { data: own } = await db.from("professionals").select("full_name, clinic_name").eq("id", practiceId).maybeSingle();
    let row = own as { full_name?: string | null; clinic_name?: string | null } | null;
    if (!row) {
      // A secretary can't read the doctor's row: the practice's public info.
      const { data } = await db.rpc("get_professional_public_info", { p_professional_id: practiceId });
      row = (Array.isArray(data) ? data[0] : data) as typeof row;
    }
    return row?.full_name?.trim() || row?.clinic_name?.trim() || "SolvyMed";
  } catch {
    return "SolvyMed";
  }
}
