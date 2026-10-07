"use client";

import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/patientFiles";
import { docPath, type DefaultFolderKey } from "@/lib/patientDocuments";
import { registerSnapshot, type SnapshotSource } from "@/app/[locale]/(site)/dashboard/(gated)/patients/snapshot-actions";

// 1.8.0 B2: uploads a PDF made in the browser as the patient's copy and
// registers it (shared). The document itself is saved already, so a failure
// here only says so: "storageFull" (the doctor's documents space is full:
// "Salvo, mas não compartilhado…") or "failed".
export type ShareOutcome = "shared" | "storageFull" | "failed";

export async function shareSnapshot(opts: {
  doctorId: string; patientId: string; bytes: Uint8Array; source: SnapshotSource; sourceId: string;
  replacesSourceId: string | null; folderKey: DefaultFolderKey; title: string;
}): Promise<ShareOutcome> {
  const supabase = createClient();
  const path = docPath(opts.doctorId, opts.patientId, crypto.randomUUID(), "application/pdf");
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([opts.bytes as BlobPart], { type: "application/pdf" }), { upsert: false, contentType: "application/pdf" });
  if (error) return /storage_full/.test(error.message ?? "") ? "storageFull" : "failed";
  const r = await registerSnapshot(opts.patientId, {
    path, source: opts.source, sourceId: opts.sourceId, replacesSourceId: opts.replacesSourceId, folderKey: opts.folderKey, title: opts.title,
  });
  if (r.ok) return "shared";
  return r.code === "storageFull" || r.code === "ownStorageFull" ? "storageFull" : "failed";
}
