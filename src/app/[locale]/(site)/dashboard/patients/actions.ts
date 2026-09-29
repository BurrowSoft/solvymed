"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId, isProfessionalRole } from "@/lib/effectiveProfId";
import { tellPatient } from "@/lib/clinicNotify";
import { actionError } from "@/lib/dbErrors";
import { clinicDate, clinicTime, getClinicTimeZone } from "@/lib/clinicTime";
import { readAccessLog, type AccessLogPage } from "@/lib/accessLog";
import { routing } from "@/i18n/routing";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { formIdKindMatches, patientIdError, patientIdKind, readPatientIds, sameIdentifier, similarPatientArgs } from "@/lib/patientIds";
import { patientSearchFilter } from "@/lib/patientSearch";
import { mergeSupported } from "@/lib/mergeProbe";
import { MERGE_COLUMNS, MERGE_ERRORS, MERGE_FIELD_KEYS, type MergeErrorCode, type MergePreviewSide, type MergeRow } from "@/lib/patientMerge";

const UUIDISH_MERGE = /^[0-9a-f-]{8,64}$/i;

// archived_at is set for an archived match, so the warning can offer
// Restore instead of creating a second record for the same person.
export type PatientMatch = { id: string; full_name: string; phone: string | null; birth_date: string | null; archived_at: string | null };

export type CreatePatientResult =
  | { success: true; id?: string }
  | { error: string; code: "generic" | "name_required" | "invalid_th_id" | "id_kind_mismatch" | "birth_year_buddhist" | "invalid_birth_date" }
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
  // The patient identifiers of the practice's country (CPF in Brazil; Thai
  // ID/passport in Thailand; passport/ID elsewhere). Strict lookup: an
  // unknown country must not silently drop an identifier.
  const country = await lookupPracticeCountry(supabase, user.id, effectiveProfId);
  if (!country.ok) return { error: "Could not verify the practice country", code: "generic" };
  const idKind = patientIdKind(country.country);
  // The form showed another country's fields: never drop the typed ID.
  if (!formIdKindMatches(formData, idKind)) return { error: "Form out of date", code: "id_kind_mismatch" };
  const ids = readPatientIds(formData, idKind);
  if (patientIdError(ids)) return { error: "Invalid Thai ID", code: "invalid_th_id" };
  const birthDate = (formData.get("birth_date") as string) || null;
  if (looksBuddhistEra(birthDate)) return { error: "Buddhist-era birth year", code: "birth_year_buddhist" };
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
      ...similarPatientArgs(ids),
    });
    if (!similarError && Array.isArray(similar) && similar.length > 0) {
      const matches = (similar as PatientMatch[]).map(({ id, full_name, phone, birth_date, archived_at }) => ({ id, full_name, phone, birth_date, archived_at: archived_at ?? null }));
      return { error: "Possible match", code: "possible_match", matches };
    }
  }

  const { data: saved, error } = await supabase.from("patients").insert({
    professional_id: effectiveProfId,
    full_name: fullName,
    email,
    phone,
    ...ids,
    sex: (formData.get("sex") as string) || null,
    birth_date: birthDate,
    profession: (formData.get("profession") as string)?.trim() || null,
    emergency_phone: (formData.get("emergency_phone") as string)?.trim() || null,
    convenio_type: (formData.get("convenio_type") as string) || null,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") {
      // A unique identifier (the CPF, Thai ID or passport key) or email
      // collision. Look the existing patient up so the user can open it.
      let existing: { id: string; full_name: string } | null = null;
      const idArgs = similarPatientArgs(ids);
      if (Object.keys(idArgs).length) {
        // The RPC can also return name/phone matches, so pick the row whose
        // identifier is the one that collided, not just the first result.
        const { data } = await supabase.rpc("find_similar_patients", { p_name: fullName, ...idArgs });
        const hit = Array.isArray(data)
          ? (data as (PatientMatch & { cpf?: string | null; th_national_id?: string | null; passport_number?: string | null })[])
              .find((m) => sameIdentifier(ids, m))
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
    // A birth date outside 1900..today (the database refuses it, 116).
    if (error.message?.includes("invalid_birth_date")) return { error: "Invalid date of birth", code: "invalid_birth_date" };
    return { error: error.message, code: "generic" };
  }
  revalidatePath("/dashboard/patients");
  return { success: true, id: (saved as { id: string } | null)?.id };
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "check_failed" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "name_required" };
  // A Buddhist-era birth year is never saved or converted (the field
  // blocks it first; this is the backstop).
  if (looksBuddhistEra(formData.get("birth_date") as string | null)) return { error: "birth_year_buddhist" };

  // Only the practice country's identifier columns are written.
  const country = await lookupPracticeCountry(supabase, user.id, effectiveProfId);
  if (!country.ok) return { error: "check_failed" };
  const idKind = patientIdKind(country.country);
  // The form showed another country's fields: saving would NULL the
  // stored ones.
  if (!formIdKindMatches(formData, idKind)) return { error: "id_kind_mismatch" };
  const ids = readPatientIds(formData, idKind);
  const idError = patientIdError(ids);
  if (idError) return { error: idError };

  const { error } = await supabase.from("patients").update({
    full_name: fullName,
    email: (formData.get("email") as string)?.trim().toLowerCase() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    ...ids,
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
  if (!user) return { error: "unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "check_failed" };

  const { error } = await supabase.from("patients").delete().eq("id", id).eq("professional_id", effectiveProfId);
  if (error) {
    // A server trigger refuses to delete a patient with clinical history
    // (records, prescriptions or files); the UI offers Archive instead, but
    // its preview can be stale.
    if (error.message?.includes("patient_has_clinical_history")) return { error: "patient_has_clinical_history" };
    // Any appointment at all (the server guard, UX): archive instead.
    if (error.message?.includes("patient_has_appointments")) return { error: "patient_has_appointments" };
    return { error: actionError(error.message) };
  }
  revalidatePath("/dashboard/patients");
  return { success: true };
}

// The next page of a patient's access log (older than `before`). The RPC
// itself allows only the practice's doctor (null otherwise).
export async function loadAccessLog(patientId: string, before: string, locale: string): Promise<AccessLogPage | "failed" | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const timeZone = await getClinicTimeZone(supabase, { professionalId: user.id, isSecretary: false });
  // The locale comes from the client: only a real app locale reaches Intl.
  const safeLocale = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  return readAccessLog(supabase, patientId, { before, locale: safeLocale, timeZone });
}

export type ArchivePreview = { hasClinicalHistory: boolean; hasAppointments: boolean; upcomingAppointments: number };

// Drives Delete-vs-Archive and the "{n} upcoming appointments will be
// cancelled" line. Delete is offered only with no clinical history and no
// appointment at all, past ones included (UX). Never exposes clinical
// content. Null on any error, and callers then hide Delete (the server
// guards are the real boundary).
export async function getArchivePreview(patientId: string): Promise<ArchivePreview | null> {
  const supabase = await createClient();
  const [{ data, error }, appts] = await Promise.all([
    supabase.rpc("get_patient_archive_preview", { p_patient_id: patientId }).maybeSingle(),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patientId),
  ]);
  if (error || !data || appts.error || appts.count === null) return null;
  const row = data as { has_clinical_history: boolean; upcoming_appointments: number };
  return { hasClinicalHistory: row.has_clinical_history, hasAppointments: appts.count > 0, upcomingAppointments: row.upcoming_appointments ?? 0 };
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
  const practiceId = (await getEffectiveProfId(supabase, user.id)) ?? user.id;
  // Each cancelled appointment, told the same way as a cancel in the
  // Schedule (the clinic's name, the patient's language; lib/clinicNotify).
  await Promise.all(cancelled
    .filter((a) => a.patient_auth_id)
    .map((a) => tellPatient(supabase, {
      kind: "cancelled", practiceId, isSecretary: user.id !== practiceId,
      patientAuthId: a.patient_auth_id, date: a.date, startTime: a.start_time,
    })));

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
  if (!user) return { error: "unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "content_required" };

  // The practice's date and time, not the server's (UTC).
  const now = new Date();
  const { error } = await supabase.from("medical_records").insert({
    patient_id: patientId,
    professional_id: user.id,
    date: clinicDate(now),
    time: clinicTime(now),
    content,
    record_type: (formData.get("record_type") as string) || "free_text",
  });

  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// Author-only, within 24 hours of creation (migration 097 enforces it and
// raises clinical_record_locked otherwise; after that, add a correction).
export async function updateRecord(id: string, patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "content_required" };

  const { error } = await supabase
    .from("medical_records")
    .update({ content, record_type: (formData.get("record_type") as string) || "free_text" })
    .eq("id", id)
    .eq("professional_id", user.id);
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// After the 24-hour window: a correction row (the original is kept and
// shown struck through). Reason required.
export async function addRecordCorrection(recordId: string, patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const content = (formData.get("content") as string)?.trim();
  const reason = (formData.get("reason") as string)?.trim();
  if (!content) return { error: "content_required" };
  if (!reason) return { error: "reason_required" };

  const { error } = await supabase.rpc("add_record_correction", {
    p_record_id: recordId,
    p_content: content,
    p_reason: reason,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function deleteRecord(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const { error } = await supabase.from("medical_records").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function createPrescription(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const notes = (formData.get("notes") as string)?.trim() || null;
  const date = clinicDate();

  const { data: prescription, error: pError } = await supabase
    .from("prescriptions")
    .insert({ patient_id: patientId, professional_id: user.id, date, notes })
    .select()
    .single();

  if (pError) return { error: actionError(pError.message) };

  const items = parseMedications(formData).map((m) => ({ ...m, prescription_id: prescription.id }));

  if (items.length === 0) {
    await supabase.from("prescriptions").delete().eq("id", prescription.id);
    return { error: "medication_required" };
  }

  const { error: iError } = await supabase.from("prescription_items").insert(items);
  if (iError) return { error: actionError(iError.message) };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function toggleBookingBlock(patientId: string, blocked: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  // A secretary manages their doctor's patients, not their own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "check_failed" };

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
  if (!user) return { error: "unauthorized" };

  const { data, error } = await supabase.rpc("generate_patient_invite_code", { p_patient_id: patientId });
  if (error) return { error: actionError(error.message) };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { code: data as string };
}

export async function deletePrescription(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  // Clinical data is doctor-only. RLS enforces it too; the hidden tabs are
  // not a boundary, since these actions are directly callable.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  // The items go first; stop if that's refused (e.g. clinical_record_locked
  // after 24 hours) instead of trying the prescription anyway.
  const { error: iError } = await supabase.from("prescription_items").delete().eq("prescription_id", id);
  if (iError) return { error: actionError(iError.message) };
  const { error } = await supabase.from("prescriptions").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// Medications from the form (name_0, dosage_0, frequency_0, duration_0, …),
// skipping rows without a name.
function parseMedications(formData: FormData) {
  const items: { name: string; dosage: string; frequency: string; duration: string }[] = [];
  for (let i = 0; formData.get(`name_${i}`) !== null; i++) {
    const name = (formData.get(`name_${i}`) as string)?.trim();
    if (!name) continue;
    items.push({
      name,
      dosage: (formData.get(`dosage_${i}`) as string)?.trim() || "",
      frequency: (formData.get(`frequency_${i}`) as string)?.trim() || "",
      duration: (formData.get(`duration_${i}`) as string)?.trim() || "",
    });
  }
  return items;
}

// Author-only, within 24 hours (097). The medications are replaced: new
// rows are inserted first and the old ones removed only after that
// succeeds, so a failure never leaves the prescription without items.
export async function updatePrescription(id: string, patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const meds = parseMedications(formData);
  if (meds.length === 0) return { error: "medication_required" };
  const notes = (formData.get("notes") as string)?.trim() || null;

  const { error: pError } = await supabase.from("prescriptions").update({ notes }).eq("id", id).eq("professional_id", user.id);
  if (pError) return { error: actionError(pError.message) };

  const { data: oldItems, error: oError } = await supabase.from("prescription_items").select("id").eq("prescription_id", id);
  if (oError) return { error: actionError(oError.message) };
  const { error: iError } = await supabase.from("prescription_items").insert(meds.map((m) => ({ ...m, prescription_id: id })));
  if (iError) return { error: actionError(iError.message) };
  const oldIds = (oldItems ?? []).map((r) => r.id as string);
  if (oldIds.length > 0) {
    const { error: dError } = await supabase.from("prescription_items").delete().in("id", oldIds);
    if (dError) return { error: actionError(dError.message) };
  }
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// After the 24-hour window: a corrected prescription (notes + medications)
// that references the original, with a required reason.
export async function addPrescriptionCorrection(prescriptionId: string, patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "not_doctor" };

  const meds = parseMedications(formData);
  const reason = (formData.get("reason") as string)?.trim();
  if (meds.length === 0) return { error: "medication_required" };
  if (!reason) return { error: "reason_required" };

  const { error } = await supabase.rpc("add_prescription_correction", {
    p_prescription_id: prescriptionId,
    p_notes: (formData.get("notes") as string)?.trim() || null,
    p_items: meds,
    p_reason: reason,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

// ── Merge duplicate patients (migration 133; the app's lib/patient-merge.ts) ──

// Mesclar shows only once the database has merge_patients (lib/mergeProbe).
export async function mergeAvailable(): Promise<boolean> {
  return mergeSupported(await createClient());
}

// The other records the doctor may pick (archived ones too), by name or ID.
export async function searchMergeCandidates(patientId: string, q: string): Promise<{ id: string; full_name: string; birth_date: string | null; archived: boolean }[]> {
  if (!UUIDISH_MERGE.test(patientId)) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await isProfessionalRole(supabase, user.id)) !== true) return [];
  // The practice country picks which ID the search also matches (never
  // assumed: unknown searches by name and passport only).
  const lookup = await lookupPracticeCountry(supabase, user.id, user.id);
  const kind = patientIdKind(lookup.ok ? lookup.country : "ZZ");
  const filter = patientSearchFilter(q, kind);
  let query = supabase.from("patients").select("id, full_name, birth_date, archived_at")
    .eq("professional_id", user.id).neq("id", patientId).order("full_name").limit(20);
  if (filter) query = query.or(filter);
  const { data } = await query;
  return ((data ?? []) as { id: string; full_name: string; birth_date: string | null; archived_at: string | null }[])
    .map((p) => ({ id: p.id, full_name: p.full_name, birth_date: p.birth_date, archived: !!p.archived_at }));
}

// Both records (the compared fields only) and what each one holds.
export async function loadMergeComparison(a: string, b: string): Promise<{ rows: MergeRow[]; preview: Record<string, MergePreviewSide> } | null> {
  if (!UUIDISH_MERGE.test(a) || !UUIDISH_MERGE.test(b) || a === b) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await isProfessionalRole(supabase, user.id)) !== true) return null;
  const [{ data: rows, error }, { data: prev, error: prevError }] = await Promise.all([
    supabase.from("patients").select(MERGE_COLUMNS).eq("professional_id", user.id).in("id", [a, b]),
    supabase.rpc("merge_patients_preview", { p_a: a, p_b: b }),
  ]);
  if (error || prevError || (rows ?? []).length !== 2) return null;
  const preview: Record<string, MergePreviewSide> = {};
  for (const r of (prev ?? []) as Record<string, unknown>[]) {
    preview[String(r.patient_id)] = {
      appointments: Number(r.appointments ?? 0), records: Number(r.records ?? 0), prescriptions: Number(r.prescriptions ?? 0),
      files: Number(r.files ?? 0), hasAppAccount: !!r.has_app_account,
    };
  }
  return { rows: rows as unknown as MergeRow[], preview };
}

// merge_patients: the kept record gets everything; choices only name fields
// taken from the removed one. The client's choices are re-validated.
export async function mergePatientsAction(keptId: string, mergedId: string, choices: Record<string, string>, appAccountConfirmed: boolean): Promise<{ ok: true; keptId: string } | { ok: false; code: MergeErrorCode }> {
  if (!UUIDISH_MERGE.test(keptId) || !UUIDISH_MERGE.test(mergedId) || keptId === mergedId) return { ok: false, code: "invalid" };
  const clean: Record<string, "merged"> = {};
  for (const [k, v] of Object.entries(choices ?? {})) {
    if (!MERGE_FIELD_KEYS.includes(k) || v !== "merged") return { ok: false, code: "invalid" };
    clean[k] = "merged";
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_allowed" };
  const { data, error } = await supabase.rpc("merge_patients", {
    p_kept_id: keptId, p_merged_id: mergedId, p_choices: clean, p_app_account_confirmed: appAccountConfirmed === true,
  });
  if (error) return { ok: false, code: MERGE_ERRORS.find((c) => (error.message ?? "").includes(c)) ?? "generic" };
  const r = (data ?? {}) as { kept_id?: string };
  revalidatePath("/dashboard/patients");
  return { ok: true, keptId: r.kept_id ?? keptId };
}
