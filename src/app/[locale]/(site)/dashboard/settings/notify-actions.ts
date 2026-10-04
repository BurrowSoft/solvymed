"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { liveFeatures } from "@/lib/liveFeatures";

// A secretary's notifications per doctor (migration 166, behind
// liveFeatures.multiPractice). The RPC refuses a doctor she doesn't serve
// (not_served); the doctor's own devices are never muted. No acting header:
// the setting is hers, across all the doctors she serves.
export async function setNotifyPref(professionalId: string, muted: boolean): Promise<{ ok: boolean }> {
  if (!liveFeatures.multiPractice) return { ok: false };
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.rpc("set_secretary_notify_pref", { p_professional_id: professionalId, p_muted: muted });
  if (error) return { ok: false };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
