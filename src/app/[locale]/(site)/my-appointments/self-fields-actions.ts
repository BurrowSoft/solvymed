"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/patientFiles";
import { SELF_KEYS } from "@/lib/selfFields";

// 1.8.0 C2 (migration 212): the patient's side. 212 checks the live
// connection and the doctor's switch (42501 otherwise), writes only required
// + still-empty fields, all or nothing, and validates them itself.

export type SelfSaveResult = { ok: true } | { ok: false; error: "invalid" | "id_in_use" | "generic"; key?: string };

export async function saveSelfFields(doctorId: string, values: Record<string, unknown>): Promise<SelfSaveResult> {
  if (!isUuid(doctorId) || !values || typeof values !== "object") return { ok: false, error: "generic" };
  // Only 212's keys go through.
  const clean = Object.fromEntries(Object.entries(values).filter(([k]) => (SELF_KEYS as readonly string[]).includes(k)));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_my_fields", { p_professional_id: doctorId, p_values: clean });
  if (error) return { ok: false, error: "generic" };
  const r = (data ?? {}) as { ok?: boolean; error?: string; key?: string };
  if (r.ok) {
    revalidatePath("/my-appointments");
    return { ok: true };
  }
  return { ok: false, error: r.error === "id_in_use" ? "id_in_use" : r.error === "invalid" ? "invalid" : "generic", key: typeof r.key === "string" ? r.key : undefined };
}

// "Agora não": the card comes back only when the doctor requires a new field.
export async function dismissSelfFields(doctorId: string): Promise<boolean> {
  if (!isUuid(doctorId)) return false;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_fields_prompted", { p_professional_id: doctorId });
  if (!error) revalidatePath("/my-appointments");
  return !error;
}
