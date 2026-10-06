"use server";

import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { serverFlag } from "@/lib/myDoctors";
import { BUCKET, isUuid } from "@/lib/patientFiles";
import {
  DOC_TITLE_MAX, docErrorKey, toDocument, toFolder,
  type DocErrorKey, type DocFolder, type PatientDocument,
} from "@/lib/patientDocuments";

// The doctor's side of 1.8.0 A (migration 190, flag 'patient_documents'):
// the patient's Documents tab. Doctor-only, as the doctor themself (no
// acting header: documents follow the records rule, never a secretary);
// 190's RPCs check the owner and the flag again. The browser uploads the
// file to <doctor>/<patient>/<uuid>.<ext> first (the storage owner policy),
// then registerDocument records it.

type Result<T> = { ok: true; data: T } | { ok: false; code: DocErrorKey };

async function doctor() {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isActiveProfessional(supabase, user.id)) !== true) return null;
  return { supabase, uid: user.id };
}

export async function documentsEnabled(): Promise<boolean> {
  const me = await doctor();
  return !!me && (await serverFlag(me.supabase, "patient_documents"));
}

export async function loadPatientDocuments(patientId: string): Promise<Result<{ folders: DocFolder[]; documents: PatientDocument[] }>> {
  if (!isUuid(patientId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  // Folders first: they're seeded on first use.
  const f = await me.supabase.rpc("get_document_folders");
  if (f.error) return { ok: false, code: docErrorKey(f.error.message, true) };
  const d = await me.supabase.rpc("list_patient_documents", { p_patient_id: patientId });
  if (d.error) return { ok: false, code: docErrorKey(d.error.message, true) };
  return {
    ok: true,
    data: {
      folders: ((f.data ?? []) as Record<string, unknown>[]).map(toFolder).sort((a, b) => a.position - b.position),
      documents: ((d.data ?? []) as Record<string, unknown>[]).map(toDocument),
    },
  };
}

export async function registerDocument(patientId: string, input: { path: string; folderId: string; title: string; shared: boolean }): Promise<Result<string>> {
  if (!isUuid(patientId) || !isUuid(input.folderId) || typeof input.path !== "string") return { ok: false, code: "generic" };
  const title = (input.title ?? "").trim().slice(0, DOC_TITLE_MAX);
  if (!title) return { ok: false, code: "invalidName" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  // 190 checks the path is <me>/<patient>/<uuid>.<ext>, the object, its size and type.
  const { data, error } = await me.supabase.rpc("register_patient_document", {
    p_patient_id: patientId, p_path: input.path, p_folder_id: input.folderId, p_title: title,
    p_shared: input.shared === true, p_source: "doctor_upload", p_source_id: null, p_replaces_id: null,
  });
  if (error) {
    // Not registered: the uploaded object would be an orphan, so it goes.
    // Except a path that's already registered (a repeated call, c6): that
    // file is a document now, and stays.
    const duplicate = error.code === "23505" || /duplicate key/i.test(error.message ?? "");
    if (!duplicate) await me.supabase.storage.from(BUCKET).remove([input.path]);
    return { ok: false, code: docErrorKey(error.message, true) };
  }
  return { ok: true, data: data as string };
}

export async function setDocumentShared(id: string, shared: boolean): Promise<Result<null>> {
  if (!isUuid(id)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { error } = await me.supabase.rpc("set_document_shared", { p_id: id, p_shared: shared === true });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: null };
}

export async function moveDocument(id: string, folderId: string): Promise<Result<null>> {
  if (!isUuid(id) || !isUuid(folderId)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { error } = await me.supabase.rpc("move_patient_document", { p_id: id, p_folder_id: folderId });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: null };
}

export async function renameDocument(id: string, title: string): Promise<Result<null>> {
  const tt = (title ?? "").trim().slice(0, DOC_TITLE_MAX);
  if (!isUuid(id) || !tt) return { ok: false, code: "invalidName" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { error } = await me.supabase.rpc("rename_patient_document", { p_id: id, p_title: tt });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: null };
}

// Opened through the edge function: a 5-minute link, and the view logged
// (a patient's upload: 'patient_upload'; the doctor's own: 'file').
export async function openDocument(id: string): Promise<Result<string>> {
  if (!isUuid(id)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { data, error } = await me.supabase.functions.invoke("patient-document", { body: { action: "url", document_id: id } });
  const url = (data as { url?: string } | null)?.url;
  if (error || !url) return { ok: false, code: "noAccess" };
  return { ok: true, data: url };
}

// The doctor's own upload within 24 h: really deleted (the owner policy;
// list_patient_documents drops the row on the next load). Otherwise hidden.
export async function deleteOwnDocument(path: string, patientId: string): Promise<Result<null>> {
  const me = await doctor();
  if (!me || !isUuid(patientId) || typeof path !== "string" || !path.startsWith(`${me.uid}/${patientId}/`)) return { ok: false, code: "generic" };
  const { data, error } = await me.supabase.storage.from(BUCKET).remove([path]);
  if (error || !data?.length) return { ok: false, code: "generic" };
  return { ok: true, data: null };
}

export async function hideDocument(path: string, patientId: string, reason: string): Promise<Result<null>> {
  const me = await doctor();
  if (!me || !isUuid(patientId) || typeof path !== "string" || !path.startsWith(`${me.uid}/${patientId}/`)) return { ok: false, code: "generic" };
  const why = (reason ?? "").trim().slice(0, 500);
  if (!why) return { ok: false, code: "invalidName" };
  const { error } = await me.supabase.rpc("hide_patient_file", { p_path: path, p_reason: why });
  return error ? { ok: false, code: "generic" } : { ok: true, data: null };
}

// ── Settings → Document folders ──────────────────────────────────────────────

export async function loadFolders(): Promise<Result<{ folders: DocFolder[]; usedBytes: number; limitBytes: number }>> {
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const [f, s] = await Promise.all([me.supabase.rpc("get_document_folders"), me.supabase.rpc("get_document_storage")]);
  if (f.error) return { ok: false, code: docErrorKey(f.error.message, true) };
  const st = ((s.data ?? []) as { used_bytes: number; limit_bytes: number }[])[0];
  return {
    ok: true,
    data: {
      folders: ((f.data ?? []) as Record<string, unknown>[]).map(toFolder).sort((a, b) => a.position - b.position),
      usedBytes: Number(st?.used_bytes ?? 0),
      limitBytes: Number(st?.limit_bytes ?? 0),
    },
  };
}

export async function countFolderShared(id: string): Promise<number | null> {
  if (!isUuid(id)) return null;
  const me = await doctor();
  if (!me) return null;
  const { data, error } = await me.supabase.rpc("count_folder_shared_documents", { p_folder_id: id });
  return error ? null : Number(data ?? 0);
}

export async function saveFolder(id: string | null, input: { name: string | null; shared: boolean; patientCanUpload: boolean }): Promise<Result<string>> {
  if (id !== null && !isUuid(id)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { data, error } = await me.supabase.rpc("save_document_folder", {
    p_id: id, p_name: input.name, p_shared: input.shared === true, p_patient_can_upload: input.shared === true && input.patientCanUpload === true,
  });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: data as string };
}

export async function reorderFolders(ids: string[]): Promise<Result<null>> {
  if (!Array.isArray(ids) || !ids.every(isUuid)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { error } = await me.supabase.rpc("reorder_document_folders", { p_ids: ids });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: null };
}

export async function deleteFolder(id: string): Promise<Result<null>> {
  if (!isUuid(id)) return { ok: false, code: "generic" };
  const me = await doctor();
  if (!me) return { ok: false, code: "noAccess" };
  const { error } = await me.supabase.rpc("delete_document_folder", { p_id: id });
  return error ? { ok: false, code: docErrorKey(error.message, true) } : { ok: true, data: null };
}
