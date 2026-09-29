"use server";

import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import {
  BUCKET, SIGNED_URL_SECONDS, folderFor, isFileDeletable, isUuid, pathBelongs,
  type FileKind, type PatientFile,
} from "@/lib/patientFiles";

// A patient's exams and files on the website (Help P7; the app's
// getPatientExams / getPatientFiles). Doctor-only: clinical data, and the
// storage policies only let the owning professional in (a secretary's
// folder would be their own, empty). Uploads go straight from the browser
// to storage (the same owner policy); these actions list, open (a signed
// link + the access log), delete within 24 h and hide after that.

type Result<T> = { ok: true; data: T } | { ok: false; code: string };

async function doctor(patientId: string) {
  if (!isUuid(patientId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isProfessionalRole(supabase, user.id)) !== true) return null;
  return { supabase, uid: user.id };
}

export async function listPatientFiles(patientId: string, kind: FileKind): Promise<Result<PatientFile[]>> {
  const me = await doctor(patientId);
  if (!me) return { ok: false, code: "not_doctor" };
  const folder = folderFor(me.uid, patientId, kind);
  const { data, error } = await me.supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) return { ok: false, code: "generic" };
  // Folders (the "exams" folder inside files) come back with no id.
  const objects = (data ?? []).filter((o) => o.id !== null && o.name && o.name !== ".emptyFolderPlaceholder");
  const { data: states } = await me.supabase
    .from("patient_file_state")
    .select("object_path, hidden_at, hidden_by_name, hidden_reason")
    .eq("patient_id", patientId);
  const hidden = new Map<string, NonNullable<PatientFile["hidden"]>>();
  for (const s of (states ?? []) as { object_path: string; hidden_at: string; hidden_by_name: string | null; hidden_reason: string }[]) {
    hidden.set(s.object_path, { at: s.hidden_at, byName: s.hidden_by_name ?? undefined, reason: s.hidden_reason });
  }
  return {
    ok: true,
    data: objects.map((o) => {
      const path = `${folder}/${o.name}`;
      const meta = (o.metadata ?? {}) as { mimetype?: string; size?: number };
      return {
        name: o.name,
        path,
        mimeType: meta.mimetype ?? "application/octet-stream",
        size: meta.size ?? 0,
        createdAt: o.created_at ?? new Date(0).toISOString(),
        ...(hidden.has(path) ? { hidden: hidden.get(path) } : {}),
      };
    }),
  };
}

// A short-lived link to open one file, logged in the patient's access log
// (TH-3, migration 111: kind "file", the storage path).
export async function openPatientFile(patientId: string, path: string): Promise<Result<string>> {
  const me = await doctor(patientId);
  if (!me) return { ok: false, code: "not_doctor" };
  if (!pathBelongs(path, me.uid, patientId)) return { ok: false, code: "generic" };
  const { data, error } = await me.supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return { ok: false, code: "generic" };
  // Best effort, like the app's: the log never blocks opening the file.
  await me.supabase.rpc("log_record_access", { p_patient_id: patientId, p_kind: "file", p_object_ref: path }).then(() => {}, () => {});
  return { ok: true, data: data.signedUrl };
}

// Within 24 h of upload: deleted (storage refuses later deletes anyway).
export async function deletePatientFile(patientId: string, path: string, createdAt: string): Promise<Result<null>> {
  const me = await doctor(patientId);
  if (!me) return { ok: false, code: "not_doctor" };
  if (!pathBelongs(path, me.uid, patientId)) return { ok: false, code: "generic" };
  if (!isFileDeletable(createdAt)) return { ok: false, code: "delete_window_passed" };
  const { data, error } = await me.supabase.storage.from(BUCKET).remove([path]);
  if (error || !data?.length) return { ok: false, code: "delete_window_passed" };
  return { ok: true, data: null };
}

// After 24 h: hidden with a reason (it stays in storage, 097).
export async function hidePatientFile(patientId: string, path: string, reason: string): Promise<Result<null>> {
  const me = await doctor(patientId);
  if (!me) return { ok: false, code: "not_doctor" };
  if (!pathBelongs(path, me.uid, patientId)) return { ok: false, code: "generic" };
  const why = reason.trim().slice(0, 500);
  if (!why) return { ok: false, code: "reason_required" };
  const { error } = await me.supabase.rpc("hide_patient_file", { p_path: path, p_reason: why });
  if (error) return { ok: false, code: error.message?.includes("reason_required") ? "reason_required" : "generic" };
  return { ok: true, data: null };
}
