"use server";

import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { isUuid } from "@/lib/patientFiles";
import { shareIntentLive, unsharedKey, type ShareSource } from "@/lib/shareIntent";

// "Not shared yet" (migration 220): doctor-only, as the documents (the
// RPCs refuse secretaries and patients too).

async function doctor() {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isActiveProfessional(supabase, user.id)) !== true) return null;
  return supabase;
}

const isSource = (s: unknown): s is ShareSource => s === "prescription" || s === "medical_document";

// The patient's prescriptions and documents meant to be shared whose copy
// never arrived, as unsharedKey()s. Nothing when it can't be read (no
// marker rather than a wrong one), for a patient without an app account
// (220 returns none) or while the condition is off.
export async function listUnshared(patientId: string): Promise<string[]> {
  if (!shareIntentLive() || !isUuid(patientId)) return [];
  const supabase = await doctor();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_unshared", { p_patient_id: patientId });
  if (error || !Array.isArray(data)) return [];
  return (data as { source?: unknown; source_id?: unknown }[])
    .filter((r) => isSource(r.source) && typeof r.source_id === "string")
    .map((r) => unsharedKey(r.source as ShareSource, r.source_id as string));
}

// "Share with the patient" on a "Not shared yet" item: the intent is
// recorded first (it may predate 220, or a past share was off), then the
// page shares it as after a save.
export async function markShareIntent(source: ShareSource, id: string): Promise<{ ok: boolean }> {
  if (!shareIntentLive() || !isSource(source) || !isUuid(id)) return { ok: false };
  const supabase = await doctor();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("mark_share_intent", { p_source: source, p_id: id });
  return { ok: !error };
}
