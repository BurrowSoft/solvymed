import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/patientFiles";

// ad (both platforms, 1.8.0 B2): deleting a document or prescription (within
// its 24 h) also removes the copies shared from it, so the patient never keeps
// a document that no longer exists in the record; the access log stays. The
// copies are found BEFORE the delete (their link is SET NULL by it) and
// removed after it: the doctor's own uploads, deletable in the same 24 h.
export type CopySource = "prescription" | "medical_document";

export async function snapshotPathsOf(supabase: SupabaseClient, uid: string, patientId: string, source: CopySource, sourceId: string): Promise<string[]> {
  const d = await supabase.rpc("list_patient_documents", { p_patient_id: patientId });
  if (d.error) return [];
  const col = source === "prescription" ? "prescription_id" : "medical_document_id";
  return ((d.data ?? []) as Record<string, unknown>[])
    .filter((r) => r.source === source && r[col] === sourceId && typeof r.storage_path === "string" && (r.storage_path as string).startsWith(`${uid}/${patientId}/`))
    .map((r) => r.storage_path as string);
}

export async function removeSnapshotPaths(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
