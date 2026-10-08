"use server";

import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { serverFlag } from "@/lib/myDoctors";
import { patientDocumentFn } from "@/lib/patientDocumentFn";
import { isUuid } from "@/lib/patientFiles";
import { DOC_TITLE_MAX, docErrorKey, type DefaultFolderKey } from "@/lib/patientDocuments";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { docDate, toDocTemplate } from "@/lib/prescriptionDoc";
import { brandedDocTemplate, docBrand, loadPracticeBrand } from "@/lib/brand";
import { liveFeatures } from "@/lib/liveFeatures";
import { readLocationLines } from "@/lib/locationLines";
import { conditionMet } from "@/lib/conditions";
import { ADDRESS_FIELDS, addressLine, type AddressColumns } from "@/lib/patientAddress";
import { patientIdKind } from "@/lib/patientIds";

// 1.8.0 B2 (the A spec; ad, both platforms): a document made in SolvyMed is
// shared with the patient as a PDF snapshot in its folder. The browser makes
// the PDF (as for "Baixar PDF"), uploads it to <doctor>/<patient>/<uuid>.pdf
// and registers it here through the patient-document function (196: it
// reads the file's real format first). Doctor-only, flag 'patient_documents'.

type Result<T> = { ok: true; data: T } | { ok: false; code: string };

async function doctor() {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isActiveProfessional(supabase, user.id)) !== true) return null;
  if (!(await serverFlag(supabase, "patient_documents"))) return null;
  return { supabase, uid: user.id };
}

export type RxSnapshotData = {
  patientName: string; patientAddress: string; date: string; iso: string;
  items: { name: string; dosage: string; frequency: string; duration: string }[];
  notes: string | null; signerName: string; signerRegistration: string | null;
  template: { primaryColor: string; accentColor: string; headerText: string | null; footerText: string | null; logoUrl: string | null };
  brand: { logoUrl: string | null; initials: string; color: string; name: string; specialty: string; registration: string } | null;
  locationLines: string[];
};

// The prescription as printed (its print view's data), read only once the
// access is logged: the PDF is the prescription opened (TH-3, as the app).
export async function prescriptionSnapshotData(patientId: string, rxId: string): Promise<Result<RxSnapshotData>> {
  if (!isUuid(patientId) || !isUuid(rxId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const lookup = await lookupPracticeCountry(me.supabase, me.uid, me.uid);
  if (!lookup.ok) return { ok: false, code: "generic" };
  const { error: logError } = await me.supabase.rpc("log_record_access", { p_patient_id: patientId, p_kind: "prescription", p_object_ref: rxId });
  if (logError) return { ok: false, code: "access_log_failed" };
  const [p, rx, prof, tpl] = await Promise.all([
    me.supabase.from("patients").select(conditionMet("patient-address-live") ? `id, full_name, ${ADDRESS_FIELDS.map((f) => f.name).join(", ")}` : "id, full_name").eq("id", patientId).eq("professional_id", me.uid).maybeSingle(),
    me.supabase.from("prescriptions").select("id, date, notes, prescription_items(name, dosage, frequency, duration)").eq("id", rxId).eq("patient_id", patientId).maybeSingle(),
    me.supabase.from("professionals").select("full_name, professional_registration").eq("id", me.uid).maybeSingle(),
    me.supabase.from("document_templates").select("primary_color, accent_color, logo_url, header_text, footer_text").eq("professional_id", me.uid).eq("document_type", "prescription").maybeSingle(),
  ]);
  const patient = p.data as unknown as ({ full_name: string } & AddressColumns) | null;
  const r = rx.data as { date: string; notes: string | null; prescription_items: RxSnapshotData["items"] | null } | null;
  if (!patient || !r) return { ok: false, code: "generic" };
  const pr = prof.data as { full_name: string | null; professional_registration: string | null } | null;
  const brandRow = liveFeatures.myBrand ? await loadPracticeBrand(me.supabase, me.uid) : null;
  const base = toDocTemplate(tpl.data as Record<string, unknown> | null);
  const t = brandedDocTemplate(base, brandRow);
  const b = docBrand(base, brandRow);
  return {
    ok: true,
    data: {
      patientName: patient.full_name ?? "",
      patientAddress: addressLine(patient, patientIdKind(lookup.country)),
      date: docDate(lookup.country, r.date),
      iso: r.date,
      items: r.prescription_items ?? [],
      notes: r.notes?.trim() ? r.notes : null,
      signerName: pr?.full_name ?? "",
      signerRegistration: pr?.professional_registration?.trim() ? pr.professional_registration : null,
      template: { primaryColor: t.primaryColor, accentColor: t.accentColor, headerText: t.headerText, footerText: t.footerText, logoUrl: t.logoUrl },
      brand: b ? { logoUrl: b.logoUrl, initials: b.initials, color: b.color, name: b.name, specialty: b.specialty, registration: b.registration } : null,
      locationLines: await readLocationLines(me.supabase, me.uid),
    },
  };
}

export type SnapshotSource = "prescription" | "medical_document";

// Everything the snapshot's registration needs, looked up BEFORE the PDF is
// uploaded (13 on #470): list_patient_documents adopts the doctor's
// unregistered files (190), so listing after the upload adopted the fresh
// PDF itself and its register then failed, leaving it as an internal
// "adopted" file. Returns the type's default folder (else "Comece aqui")
// and, for an edit or a correction, the shared snapshot it replaces: the
// RPC doesn't check where the replaced row came from, so it's picked here
// by its source (86).
export async function prepareSnapshot(patientId: string, input: {
  source: SnapshotSource; replacesSourceId: string | null; folderKey: DefaultFolderKey;
}): Promise<Result<{ folderId: string; replacesId: string | null }>> {
  if (!isUuid(patientId) || (input.replacesSourceId !== null && !isUuid(input.replacesSourceId))) return { ok: false, code: "generic" };
  if (input.source !== "prescription" && input.source !== "medical_document") return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const f = await me.supabase.rpc("get_document_folders");
  if (f.error) return { ok: false, code: docErrorKey(f.error.message, true) };
  const folders = (f.data ?? []) as { id: string; default_key: string | null }[];
  const folder = folders.find((x) => x.default_key === input.folderKey) ?? folders.find((x) => x.default_key === "start");
  if (!folder) return { ok: false, code: "generic" };
  let replacesId: string | null = null;
  if (input.replacesSourceId) {
    const d = await me.supabase.rpc("list_patient_documents", { p_patient_id: patientId });
    if (d.error) return { ok: false, code: docErrorKey(d.error.message, true) };
    const col = input.source === "prescription" ? "prescription_id" : "medical_document_id";
    const old = ((d.data ?? []) as Record<string, unknown>[])
      .find((r) => r.source === input.source && r[col] === input.replacesSourceId && r.replaced !== true);
    replacesId = (old?.id as string | undefined) ?? null;
  }
  return { ok: true, data: { folderId: folder.id, replacesId } };
}

// Registers the uploaded snapshot, shared, with what prepareSnapshot found.
// Nothing here lists the patient's documents (that would adopt the upload);
// if the register fails, the function removes the caller's fresh upload.
export async function registerSnapshot(patientId: string, input: {
  path: string; source: SnapshotSource; sourceId: string; replacesId: string | null; folderId: string; title: string;
}): Promise<Result<string>> {
  if (!isUuid(patientId) || !isUuid(input.sourceId) || !isUuid(input.folderId) || (input.replacesId !== null && !isUuid(input.replacesId))) return { ok: false, code: "generic" };
  if (input.source !== "prescription" && input.source !== "medical_document") return { ok: false, code: "generic" };
  const title = (input.title ?? "").trim().slice(0, DOC_TITLE_MAX);
  if (!title || typeof input.path !== "string") return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const r = await patientDocumentFn<{ document_id?: string }>(me.supabase, {
    action: "register", patient_id: patientId, path: input.path, folder_id: input.folderId, title,
    shared: true, source: input.source, source_id: input.sourceId, replaces_id: input.replacesId,
  });
  if (!r.ok || !r.data?.document_id) return { ok: false, code: r.ok ? "generic" : docErrorKey(r.code, true) };
  return { ok: true, data: r.data.document_id };
}
