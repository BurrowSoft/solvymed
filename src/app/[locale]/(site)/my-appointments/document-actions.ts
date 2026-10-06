"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/patientFiles";
import { DOC_MAX_BYTES, DOC_TITLE_MAX, docErrorKey, type DocErrorKey, type DocMime } from "@/lib/patientDocuments";
import { patientDocumentFn } from "@/lib/patientDocumentFn";

// The patient's side of 1.8.0 A (migration 190, flag 'patient_documents'):
// the documents their doctors share, and sending one. Read as the patient
// (190 returns nothing unless the flag is on for them and they're connected
// to that doctor); files are opened and received only through the
// patient-document edge function, which checks and logs everything.

type Result<T> = { ok: true; data: T } | { ok: false; code: DocErrorKey };

export type DocDoctor = { professionalId: string; doctor: string; documentCount: number; canUpload: boolean };
export type MyDocFolder = {
  id: string; defaultKey: string | null; name: string | null; canUpload: boolean;
  documents: { id: string; title: string; mime: string; sizeBytes: number; createdAt: string; corrected: boolean; sentByMe: boolean; canRemove: boolean }[];
};

async function patient() {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  return user ? supabase : null;
}

const fn = patientDocumentFn;

export async function loadMyDocumentDoctors(): Promise<DocDoctor[] | null> {
  const supabase = await patient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_my_document_doctors");
  if (error) return null;
  return ((data ?? []) as { professional_id: string; doctor: string; document_count: number; can_upload: boolean }[]).map((r) => ({
    professionalId: r.professional_id, doctor: r.doctor, documentCount: Number(r.document_count ?? 0), canUpload: r.can_upload === true,
  }));
}

export async function loadMyDocuments(professionalId: string): Promise<Result<MyDocFolder[]>> {
  if (!isUuid(professionalId)) return { ok: false, code: "generic" };
  const supabase = await patient();
  if (!supabase) return { ok: false, code: "noAccess" };
  const { data, error } = await supabase.rpc("list_my_documents", { p_professional_id: professionalId });
  if (error) return { ok: false, code: "generic" };
  // A folder line (document_id null), then its documents.
  const folders: MyDocFolder[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    let f = folders.find((x) => x.id === r.folder_id);
    if (!f) {
      f = { id: r.folder_id as string, defaultKey: (r.default_key as string | null) ?? null, name: (r.folder_name as string | null) ?? null, canUpload: r.can_upload === true, documents: [] };
      folders.push(f);
    }
    if (r.document_id) {
      f.documents.push({
        id: r.document_id as string, title: r.title as string, mime: r.mime as string, sizeBytes: Number(r.size_bytes ?? 0),
        createdAt: r.created_at as string, corrected: r.corrected === true, sentByMe: r.sent_by_me === true, canRemove: r.can_remove === true,
      });
    }
  }
  return { ok: true, data: folders };
}

export async function openMyDocument(id: string): Promise<Result<string>> {
  if (!isUuid(id)) return { ok: false, code: "generic" };
  const supabase = await patient();
  if (!supabase) return { ok: false, code: "noAccess" };
  const r = await fn<{ url?: string }>(supabase, { action: "url", document_id: id });
  if (!r.ok || !r.data?.url) return { ok: false, code: "noAccess" };
  return { ok: true, data: r.data.url };
}

// Step 1 of sending: a pending document + a signed upload URL for its path
// (the browser then PUTs the file there, and finishUpload checks its bytes).
export async function startUpload(input: { professionalId: string; folderId: string; title: string; mime: DocMime; size: number }):
  Promise<Result<{ documentId: string; path: string; token: string }>> {
  const title = (input.title ?? "").trim().slice(0, DOC_TITLE_MAX);
  if (!isUuid(input.professionalId) || !isUuid(input.folderId) || !title) return { ok: false, code: "generic" };
  if (!(input.size > 0) || input.size > DOC_MAX_BYTES) return { ok: false, code: "tooLarge" };
  const supabase = await patient();
  if (!supabase) return { ok: false, code: "noAccess" };
  const r = await fn<{ document_id: string; path: string; token: string }>(supabase, {
    action: "upload_start", professional_id: input.professionalId, folder_id: input.folderId, title, mime: input.mime, size: input.size,
  });
  if (!r.ok) return { ok: false, code: docErrorKey(r.code) };
  return { ok: true, data: { documentId: r.data.document_id, path: r.data.path, token: r.data.token } };
}

export async function finishUpload(documentId: string): Promise<Result<null>> {
  if (!isUuid(documentId)) return { ok: false, code: "generic" };
  const supabase = await patient();
  if (!supabase) return { ok: false, code: "noAccess" };
  const r = await fn(supabase, { action: "upload_finish", document_id: documentId });
  return r.ok ? { ok: true, data: null } : { ok: false, code: docErrorKey(r.code) };
}

// The patient's own upload, until the doctor opens it (within 24 h; UX Q6).
export async function removeMyUpload(documentId: string): Promise<Result<null>> {
  if (!isUuid(documentId)) return { ok: false, code: "generic" };
  const supabase = await patient();
  if (!supabase) return { ok: false, code: "noAccess" };
  const r = await fn(supabase, { action: "remove_upload", document_id: documentId });
  return r.ok ? { ok: true, data: null } : { ok: false, code: docErrorKey(r.code) };
}
