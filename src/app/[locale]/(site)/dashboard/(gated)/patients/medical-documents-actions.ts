"use server";

import { revalidatePath } from "next/cache";
import { readLocationLines } from "@/lib/locationLines";
import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { serverFlag } from "@/lib/myDoctors";
import { actionError } from "@/lib/dbErrors";
import { isUuid } from "@/lib/patientFiles";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { toDocTemplate } from "@/lib/prescriptionDoc";
import { brandedDocTemplate, docBrand, loadPracticeBrand } from "@/lib/brand";
import { liveFeatures } from "@/lib/liveFeatures";
import { documentDatesLookBuddhist } from "@/lib/buddhistEra";
import { DOC_LANGS, documentTypesFor, fixedLanguage, validateFields, type DocFields, type DocLang, type MedicalDocType } from "@/lib/medicalDocuments";

// 1.8.0 B on the website (migration 189's medical_documents, behind the
// server flag 'clinical_documents'): the doctor's certificates, declarations,
// exam requests, the controlled prescription and the Thai certificate.
// Doctor-only (clinical data; RLS "medical_documents: own" too). Authorship,
// the 24-hour lock and corrections are the database's (189, as records).

type Result<T> = { ok: true; data: T } | { ok: false; code: string };

async function doctor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isActiveProfessional(supabase, user.id)) !== true) return null;
  if (!(await serverFlag(supabase, "clinical_documents"))) return null;
  return { supabase, uid: user.id };
}

type Input = { type: MedicalDocType; lang: DocLang; fields: DocFields; body: string };

// The type must be one the practice's country offers, the language one of
// the seven (the controlled prescription: Portuguese only), the fields
// complete for the type.
async function checked(me: NonNullable<Awaited<ReturnType<typeof doctor>>>, input: Input): Promise<{ ok: true; lang: DocLang } | { ok: false; code: string }> {
  const lookup = await lookupPracticeCountry(me.supabase, me.uid, me.uid);
  if (!lookup.ok) return { ok: false, code: "generic" };
  if (!documentTypesFor(lookup.country).includes(input.type)) return { ok: false, code: "check_failed" };
  const lang = fixedLanguage(input.type) ?? input.lang;
  if (!(DOC_LANGS as readonly string[]).includes(lang)) return { ok: false, code: "check_failed" };
  // Dates are typed in the Gregorian year (ad, 1.8.0); a Buddhist-era-looking
  // one is refused, never converted (as patients' birth dates).
  if (documentDatesLookBuddhist(input.fields)) return { ok: false, code: "buddhist_year" };
  const bad = validateFields(input.type, input.fields, input.body ?? "");
  if (bad) return { ok: false, code: `field_${bad}` };
  return { ok: true, lang };
}

export async function createMedicalDocument(patientId: string, input: Input): Promise<Result<string>> {
  if (!isUuid(patientId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "not_doctor" };
  const c = await checked(me, input);
  if (!c.ok) return c;
  const { data, error } = await me.supabase.from("medical_documents").insert({
    patient_id: patientId, professional_id: me.uid, doc_type: input.type, language: c.lang,
    fields: input.fields, body: (input.body ?? "").trim() || null,
  }).select("id").single();
  if (error || !data) return { ok: false, code: actionError(error?.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { ok: true, data: data.id as string };
}

// Author-only, within 24 hours (189 refuses otherwise: clinical_record_locked).
export async function updateMedicalDocument(id: string, patientId: string, input: Input): Promise<Result<null>> {
  if (!isUuid(id) || !isUuid(patientId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "not_doctor" };
  const c = await checked(me, input);
  if (!c.ok) return c;
  const { error } = await me.supabase.from("medical_documents")
    .update({ language: c.lang, fields: input.fields, body: (input.body ?? "").trim() || null })
    .eq("id", id).eq("professional_id", me.uid);
  if (error) return { ok: false, code: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { ok: true, data: null };
}

// After 24 hours: a correction (189's add_document_correction), the original kept.
export async function correctMedicalDocument(id: string, patientId: string, input: Input & { reason: string }): Promise<Result<null>> {
  if (!isUuid(id) || !isUuid(patientId)) return { ok: false, code: "generic" };
  const reason = (input.reason ?? "").trim();
  if (!reason) return { ok: false, code: "reason_required" };
  const me = await doctor();
  if (!me) return { ok: false, code: "not_doctor" };
  const c = await checked(me, input);
  if (!c.ok) return c;
  const { error } = await me.supabase.rpc("add_document_correction", {
    p_document_id: id, p_body: (input.body ?? "").trim() || null, p_fields: input.fields, p_reason: reason,
  });
  if (error) return { ok: false, code: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { ok: true, data: null };
}

export async function deleteMedicalDocument(id: string, patientId: string): Promise<Result<null>> {
  if (!isUuid(id) || !isUuid(patientId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "not_doctor" };
  const { error } = await me.supabase.from("medical_documents").delete().eq("id", id).eq("professional_id", me.uid);
  if (error) return { ok: false, code: actionError(error.message) };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { ok: true, data: null };
}

export type DocPrintData = {
  country: string;
  idKind: "cpf" | "thai_id" | "passport";
  template: { primaryColor: string; accentColor: string; headerText: string | null; footerText: string | null; logoUrl: string | null };
  brand: { logoUrl: string | null; initials: string; color: string; name: string; specialty: string; registration: string } | null;
  doctor: { name: string; registration: string | null; clinicName: string | null; address: string | null; city: string | null; state: string | null; phone: string | null };
  patient: { name: string; cpf: string | null; thId: string | null; passport: string | null };
  // 1.8.0 F: the footer's location lines (2+ locations, switch on).
  locationLines: string[];
};

// Everything the PDF needs, read only once the access is logged ('document',
// 111/189): fail closed, as the print views (UX 36).
export async function documentPrintData(patientId: string, documentId: string): Promise<Result<DocPrintData>> {
  if (!isUuid(patientId) || !isUuid(documentId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "not_doctor" };
  const lookup = await lookupPracticeCountry(me.supabase, me.uid, me.uid);
  if (!lookup.ok) return { ok: false, code: "generic" };
  const { error: logError } = await me.supabase.rpc("log_record_access", { p_patient_id: patientId, p_kind: "document", p_object_ref: documentId });
  if (logError) return { ok: false, code: "access_log_failed" };
  const [p, prof, tpl] = await Promise.all([
    me.supabase.from("patients").select("full_name, cpf, th_national_id, passport_number").eq("id", patientId).eq("professional_id", me.uid).maybeSingle(),
    me.supabase.from("professionals").select("full_name, professional_registration, clinic_name, clinic_address, clinic_city, clinic_state, clinic_phone").eq("id", me.uid).maybeSingle(),
    me.supabase.from("document_templates").select("primary_color, accent_color, logo_url, header_text, footer_text").eq("professional_id", me.uid).eq("document_type", "prescription").maybeSingle(),
  ]);
  if (!p.data) return { ok: false, code: "generic" };
  const brandRow = liveFeatures.myBrand ? await loadPracticeBrand(me.supabase, me.uid) : null;
  const base = toDocTemplate(tpl.data as Record<string, unknown> | null);
  const t = brandedDocTemplate(base, brandRow);
  const b = docBrand(base, brandRow);
  const pr = prof.data as Record<string, string | null> | null;
  const pa = p.data as Record<string, string | null>;
  return {
    ok: true,
    data: {
      country: lookup.country,
      locationLines: await readLocationLines(me.supabase, me.uid),
      idKind: countryProfile(lookup.country).patientId,
      template: { primaryColor: t.primaryColor, accentColor: t.accentColor, headerText: t.headerText, footerText: t.footerText, logoUrl: t.logoUrl },
      brand: b ? { logoUrl: b.logoUrl, initials: b.initials, color: b.color, name: b.name, specialty: b.specialty, registration: b.registration } : null,
      doctor: {
        name: pr?.full_name ?? "", registration: pr?.professional_registration?.trim() || null, clinicName: pr?.clinic_name ?? null,
        address: pr?.clinic_address ?? null, city: pr?.clinic_city ?? null, state: pr?.clinic_state ?? null, phone: pr?.clinic_phone ?? null,
      },
      patient: { name: pa.full_name ?? "", cpf: pa.cpf ?? null, thId: pa.th_national_id ?? null, passport: pa.passport_number ?? null },
    },
  };
}
