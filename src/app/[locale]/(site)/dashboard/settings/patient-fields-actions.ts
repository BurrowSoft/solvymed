"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FIELD_KEYS, type FieldRule, type PatientFieldRules } from "@/lib/patientFields";

// 1.8.0 C1: the doctor saves which patient details the forms ask for
// (207's set_patient_fields: doctor only; refuses unknown keys/values).
export async function savePatientFields(rules: PatientFieldRules): Promise<{ ok: boolean }> {
  const clean: Record<string, FieldRule> = {};
  for (const [k, v] of Object.entries(rules)) {
    if ((FIELD_KEYS as readonly string[]).includes(k) && (v === "required" || v === "optional" || v === "hidden")) clean[k] = v;
  }
  try {
    const supabase = await createClient({ acting: false });
    const { error } = await supabase.rpc("set_patient_fields", { p_rules: clean });
    if (error) return { ok: false };
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/patients");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
