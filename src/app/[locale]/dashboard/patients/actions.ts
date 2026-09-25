"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";

export type PatientMatch = { id: string; full_name: string; phone: string | null; birth_date: string | null };

export type CreatePatientResult =
  | { success: true }
  | { error: string; code: "generic" | "name_required" }
  // Possible duplicates found before saving. The user chooses "Open
  // existing" or "Create anyway" (resubmits with force=1).
  | { error: string; code: "possible_match"; matches: PatientMatch[] }
  // A real duplicate (unique CPF or email). Nothing was saved.
  | { error: string; code: "already_registered"; existing: { id: string; full_name: string } | null };

export async function createPatient(formData: FormData): Promise<CreatePatientResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Full name is required", code: "name_required" };

  const email = (formData.get("email") as string)?.trim().toLowerCase() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const cpf = (formData.get("cpf") as string)?.trim() || null;
  const birthDate = (formData.get("birth_date") as string) || null;
  const force = formData.get("force") === "1";

  // Email must be unique per doctor.
  if (email) {
    const { data: existing } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("professional_id", effectiveProfId)
      .ilike("email", email)
      .limit(1);
    if (existing?.length) {
      return { error: "Already registered", code: "already_registered", existing: existing[0] as { id: string; full_name: string } };
    }
  }

  // Warn about likely duplicates (same phone digits, or same name + birth
  // date) before creating another record. This is a convenience, not a
  // boundary: if the lookup fails, creation goes ahead, and the unique CPF
  // index still stops true duplicates. It returns no clinical fields.
  if (!force) {
    const { data: similar, error: similarError } = await supabase.rpc("find_similar_patients", {
      p_name: fullName,
      p_phone: phone,
      p_birth_date: birthDate,
      p_cpf: cpf,
    });
    if (!similarError && Array.isArray(similar) && similar.length > 0) {
      const matches = (similar as PatientMatch[]).map(({ id, full_name, phone, birth_date }) => ({ id, full_name, phone, birth_date }));
      return { error: "Possible match", code: "possible_match", matches };
    }
  }

  const { error } = await supabase.from("patients").insert({
    professional_id: effectiveProfId,
    full_name: fullName,
    email,
    phone,
    cpf,
    sex: (formData.get("sex") as string) || null,
    birth_date: birthDate,
    profession: (formData.get("profession") as string)?.trim() || null,
    emergency_phone: (formData.get("emergency_phone") as string)?.trim() || null,
    convenio_type: (formData.get("convenio_type") as string) || null,
  });

  if (error) {
    if (error.code === "23505") {
      // A unique CPF (patients_professional_cpf_key) or email collision.
      // Look the existing patient up so the user can open it.
      let existing: { id: string; full_name: string } | null = null;
      if (cpf) {
        const { data } = await supabase.rpc("find_similar_patients", { p_name: fullName, p_cpf: cpf });
        const hit = Array.isArray(data) ? (data as PatientMatch[])[0] : undefined;
        if (hit) existing = { id: hit.id, full_name: hit.full_name };
      }
      return { error: "Already registered", code: "already_registered", existing };
    }
    return { error: error.message, code: "generic" };
  }
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Full name is required" };

  const { error } = await supabase.from("patients").update({
    full_name: fullName,
    email: (formData.get("email") as string)?.trim().toLowerCase() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    cpf: (formData.get("cpf") as string)?.trim() || null,
    sex: (formData.get("sex") as string) || null,
    birth_date: (formData.get("birth_date") as string) || null,
    profession: (formData.get("profession") as string)?.trim() || null,
    emergency_phone: (formData.get("emergency_phone") as string)?.trim() || null,
    convenio_type: (formData.get("convenio_type") as string) || null,
  }).eq("id", id).eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${id}`);
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function deletePatient(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

  const { error } = await supabase.from("patients").delete().eq("id", id).eq("professional_id", effectiveProfId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function createRecord(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Record content is required" };

  const now = new Date();
  const { error } = await supabase.from("medical_records").insert({
    patient_id: patientId,
    professional_id: user.id,
    date: now.toISOString().split("T")[0],
    time: now.toTimeString().slice(0, 5),
    content,
    record_type: (formData.get("record_type") as string) || "free_text",
  });

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function deleteRecord(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("medical_records").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function createPrescription(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const notes = (formData.get("notes") as string)?.trim() || null;
  const date = new Date().toISOString().split("T")[0];

  const { data: prescription, error: pError } = await supabase
    .from("prescriptions")
    .insert({ patient_id: patientId, professional_id: user.id, date, notes })
    .select()
    .single();

  if (pError) return { error: pError.message };

  // Parse medications from form (name_0, dosage_0, frequency_0, duration_0, ...)
  const items: { prescription_id: string; name: string; dosage: string; frequency: string; duration: string }[] = [];
  let i = 0;
  while (formData.get(`name_${i}`) !== null) {
    const name = (formData.get(`name_${i}`) as string)?.trim();
    if (name) {
      items.push({
        prescription_id: prescription.id,
        name,
        dosage: (formData.get(`dosage_${i}`) as string)?.trim() || "",
        frequency: (formData.get(`frequency_${i}`) as string)?.trim() || "",
        duration: (formData.get(`duration_${i}`) as string)?.trim() || "",
      });
    }
    i++;
  }

  if (items.length === 0) {
    await supabase.from("prescriptions").delete().eq("id", prescription.id);
    return { error: "Add at least one medication" };
  }

  const { error: iError } = await supabase.from("prescription_items").insert(items);
  if (iError) return { error: iError.message };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function toggleBookingBlock(patientId: string, blocked: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

  const { error } = await supabase
    .from("patients")
    .update({ booking_blocked: blocked })
    .eq("id", patientId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function generatePatientInviteCode(patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data, error } = await supabase.rpc("generate_patient_invite_code", { p_patient_id: patientId });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { code: data as string };
}

export async function deletePrescription(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase.from("prescription_items").delete().eq("prescription_id", id);
  const { error } = await supabase.from("prescriptions").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}
