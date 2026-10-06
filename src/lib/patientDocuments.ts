// Documents shared with the patient (1.8.0 A; migration 190, behind the
// server flag 'patient_documents'). Every document lives in the private
// patient-files bucket at <doctor>/<patient>/<document id>.<ext>; the
// database (190's RPCs) decides who sees what, and files are opened only
// through the patient-document edge function (a 5-minute link + the access
// log). The app keeps the same rules (lib/document-service.ts).

export const DOC_MAX_BYTES = 20 * 1024 * 1024;
export const DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/heic"] as const;
export type DocMime = (typeof DOC_MIMES)[number];
export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic";
export const DOC_TITLE_MAX = 200;
export const FOLDER_NAME_MAX = 60;
export const FOLDERS_MAX = 30;
export const STORAGE_NOTICE_RATIO = 0.8;

export type DefaultFolderKey = "start" | "exams" | "prescriptions" | "certificates" | "consents" | "internal";
export const DEFAULT_FOLDER_KEYS: readonly DefaultFolderKey[] = ["start", "exams", "prescriptions", "certificates", "consents", "internal"];

export type DocFolder = {
  id: string;
  defaultKey: DefaultFolderKey | null;
  name: string | null; // null = the default's translated name
  position: number;
  shared: boolean;
  patientCanUpload: boolean;
  documentCount: number;
};

export type PatientDocument = {
  id: string;
  folderId: string;
  title: string;
  mime: string;
  sizeBytes: number;
  source: string;
  replacesId: string | null;
  replaced: boolean;
  shared: boolean;
  uploadedByRole: "professional" | "patient";
  doctorOpenedAt: string | null;
  createdAt: string;
  storagePath: string;
  hidden: { at: string; byName: string | null; reason: string } | null;
};

// The browser's type for a file, by its extension when the browser gives
// none (HEIC often comes as ""). The server checks the real bytes anyway.
export function docMime(file: { type: string; name: string }): DocMime | null {
  const t = (file.type || "").toLowerCase();
  if ((DOC_MIMES as readonly string[]).includes(t)) return t as DocMime;
  if (t === "image/jpg") return "image/jpeg";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return ext === "pdf" ? "application/pdf" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : null;
}

export function docExt(mime: DocMime): string {
  return mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "heic";
}

// 190's register_patient_document accepts only this path.
export function docPath(doctorId: string, patientId: string, documentId: string, mime: DocMime): string {
  return `${doctorId}/${patientId}/${documentId}.${docExt(mime)}`;
}

// The file name without its extension, as the default title.
export function defaultTitle(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").trim();
  return (base || fileName).slice(0, DOC_TITLE_MAX);
}

export function toFolder(r: Record<string, unknown>): DocFolder {
  return {
    id: r.id as string,
    defaultKey: (r.default_key as DefaultFolderKey | null) ?? null,
    name: (r.name as string | null) ?? null,
    position: (r.position as number) ?? 0,
    shared: r.shared === true,
    patientCanUpload: r.patient_can_upload === true,
    documentCount: Number(r.document_count ?? 0),
  };
}

export function toDocument(r: Record<string, unknown>): PatientDocument {
  return {
    id: r.id as string,
    folderId: r.folder_id as string,
    title: r.title as string,
    mime: r.mime as string,
    sizeBytes: Number(r.size_bytes ?? 0),
    source: r.source as string,
    replacesId: (r.replaces_id as string | null) ?? null,
    replaced: r.replaced === true,
    shared: r.shared === true,
    uploadedByRole: r.uploaded_by_role === "patient" ? "patient" : "professional",
    doctorOpenedAt: (r.doctor_opened_at as string | null) ?? null,
    createdAt: r.created_at as string,
    storagePath: r.storage_path as string,
    hidden: r.hidden_at ? { at: r.hidden_at as string, byName: (r.hidden_by_name as string | null) ?? null, reason: (r.hidden_reason as string) ?? "" } : null,
  };
}

// Server codes (190 + the edge function) → the docs.err keys the UI shows.
export type DocErrorKey = "tooLarge" | "type" | "cantShareType" | "dailyLimit" | "patientFull" | "storageFull" | "ownStorageFull" | "noAccess" | "folderNotEmpty" | "maxFolders" | "invalidName" | "generic";
export function docErrorKey(message: string | null | undefined, asDoctor = false): DocErrorKey {
  const m = message ?? "";
  if (m.includes("too_large")) return "tooLarge";
  if (m.includes("not_allowed_file")) return "type";
  if (m.includes("daily_limit")) return "dailyLimit";
  if (m.includes("patient_full")) return "patientFull";
  if (m.includes("storage_full")) return asDoctor ? "ownStorageFull" : "storageFull";
  if (m.includes("folder_not_empty")) return "folderNotEmpty";
  if (m.includes("too_many_folders")) return "maxFolders";
  if (m.includes("invalid_name")) return "invalidName";
  if (m.includes("not_found") || m.includes("not_allowed")) return "noAccess";
  return "generic";
}

// The doctor's own upload can still be deleted within 24 h (097's window);
// after that, or for anything else, it's hidden with a reason.
export function canDeleteOwn(d: PatientDocument, now = Date.now()): boolean {
  return d.uploadedByRole === "professional" && d.source === "doctor_upload" && now - new Date(d.createdAt).getTime() < 24 * 3600 * 1000 - 5 * 60 * 1000;
}

// A stored timestamp as the VIEWER's own day (cf: upload dates are system
// dates: the viewer's time zone, the reader's calendar), for formatShortDate.
export function localDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
