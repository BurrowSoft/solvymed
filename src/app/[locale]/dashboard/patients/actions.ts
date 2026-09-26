"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId, isProfessionalRole } from "@/lib/effectiveProfId";
import { sendExpoPush } from "@/lib/push";
import { actionError } from "@/lib/dbErrors";

// archived_at is set for an archived match, so the warning can offer
// Restore instead of creating a second record for the same person.
export type PatientMatch = { id: string; full_name: string; phone: string | null; birth_date: string | null; archived_at: string | null };

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
      const matches = (similar as PatientMatch[]).map(({ id, full_name, phone, birth_date, archived_at }) => ({ id, full_name, phone, birth_date, archived_at: archived_at ?? null }));
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
        // The RPC can also return name/phone matches, so pick the row whose
        // CPF is the one that collided, not just the first result.
        const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
        const { data } = await supabase.rpc("find_similar_patients", { p_name: fullName, p_cpf: cpf });
        const hit = Array.isArray(data)
          ? (data as (PatientMatch & { cpf?: string | null })[]).find((m) => digits(m.cpf) === digits(cpf))
          : undefined;
        if (hit) existing = { id: hit.id, full_name: hit.full_name };
      }
      // An email collision (e.g. two creates racing past the pre-check
      // above): look the patient up by the same normalized email.
      if (!existing && email) {
        const { data } = await supabase
          .from("patients")
          .select("id, full_name")
          .eq("professional_id", effectiveProfId)
          .ilike("email", email)
          .limit(1);
        if (data?.length) existing = data[0] as { id: string; full_name: string };
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

  if (error) return { error: actionError(error.message) };
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
  if (error) {
    // A server trigger refuses to delete a patient with clinical history
    // (records, prescriptions or files); the UI offers Archive instead, but
    // its preview can be stale.
    if (error.message?.includes("patient_has_clinical_history")) return { error: "patient_has_clinical_history" };
    return { error: actionError(error.message) };
  }
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export type ArchivePreview = { hasClinicalHistory: boolean; upcomingAppointments: number };

// Drives Delete-vs-Archive and the "{n} upcoming appointments will be
// cancelled" line. Never exposes clinical content. Null on any error, and
// callers then hide Delete (the delete trigger is the real boundary).
export async function getArchivePreview(patientId: string): Promise<ArchivePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_patient_archive_preview", { p_patient_id: patientId })
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { has_clinical_history: boolean; upcoming_appointments: number };
  return { hasClinicalHistory: row.has_clinical_history, upcomingAppointments: row.upcoming_appointments ?? 0 };
}

export type ArchiveResult =
  | { success: true; cancelled: number }
  | { error: "patient_not_found" | "already_archived" | "generic" };

export async function archivePatient(patientId: string): Promise<ArchiveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  // The RPC scopes to the caller's practice (doctor or linked secretary),
  // cancels upcoming appointments in the same transaction and returns them,
  // so every cancelled appointment gets its notification, including one
  // booked a moment before the archive.
  const { data, error } = await supabase.rpc("archive_patient", { p_patient_id: patientId });
  if (error) {
    if (error.message?.includes("patient_not_found")) return { error: "patient_not_found" };
    if (error.message?.includes("already_archived")) return { error: "already_archived" };
    return { error: "generic" };
  }

  const cancelled = (data ?? []) as { appointment_id: string; patient_auth_id: string | null; date: string; start_time: string }[];
  await Promise.all(cancelled
    .filter((a) => a.patient_auth_id)
    .map(async (a) => {
      const { data: tokenRows } = await supabase.rpc("get_patient_push_tokens", { p_patient_auth_id: a.patient_auth_id });
      const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token);
      await sendExpoPush(
        tokens,
        "Appointment Cancelled",
        `Your appointment on ${a.date} at ${a.start_time.slice(0, 5)} has been cancelled by the clinic.`,
      );
    }));

  revalidatePath("/dashboard/patients");
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard/schedule");
  return { success: true, cancelled: cancelled.length };
}

export type RestoreResult = { success: true } | { error: "patient_not_found" | "generic" };

export async function restorePatient(patientId: string): Promise<RestoreResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const { error } = await supabase.rpc("restore_patient", { p_patient_id: patientId });
  if (error) {
    if (error.message?.includes("patient_not_found")) return { error: "patient_not_found" };
    // Someone else restored it first: the end state is what was asked for.
    if (error.message?.includes("not_archived")) return { success: true };
    return { error: "generic" };
  }
  revalidatePath("/dashboard/patients");
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function createRecord(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinical records" };

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

  if (error) return { error: error.message?.includes("patient_archived") ? "patient_archived" : error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function deleteRecord(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinical records" };

  const { error } = await supabase.from("medical_records").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function createPrescription(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinical records" };

  const notes = (formData.get("notes") as string)?.trim() || null;
  const date = new Date().toISOString().split("T")[0];

  const { data: prescription, error: pError } = await supabase
    .from("prescriptions")
    .insert({ patient_id: patientId, professional_id: user.id, date, notes })
    .select()
    .single();

  if (pError) return { error: pError.message?.includes("patient_archived") ? "patient_archived" : pError.message };

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
  if (iError) return { error: actionError(iError.message) };

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

  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function generatePatientInviteCode(patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data, error } = await supabase.rpc("generate_patient_invite_code", { p_patient_id: patientId });
  if (error) return { error: actionError(error.message) };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { code: data as string };
}

export async function deletePrescription(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinical records" };

  await supabase.from("prescription_items").delete().eq("prescription_id", id);
  const { error } = await supabase.from("prescriptions").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}
