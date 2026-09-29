// A patient's exams and files (the app's getPatientExams / getPatientFiles;
// migrations 090 and 097): private bucket "patient-files", objects under
// <professional_id>/<patient_id>/<name> (files) or .../exams/<name>
// (exams). Only the owning professional reads or writes them (secretaries
// never see clinical files). Deleting is allowed for 24 hours after upload
// (storage enforces it); after that a file can only be hidden, with a
// reason (hide_patient_file), and stays in storage.

export type FileKind = "exams" | "files";

export type PatientFile = {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  createdAt: string;
  // Hidden after its delete window (097), with who and why.
  hidden?: { at: string; byName?: string; reason: string };
};

export const BUCKET = "patient-files";
export const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
// A signed link for opening a file (the app uses 1 hour too).
export const SIGNED_URL_SECONDS = 60 * 60;
// Supabase's default upload limit is 50 MB; say so before trying.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function folderFor(professionalId: string, patientId: string, kind: FileKind): string {
  return kind === "exams" ? `${professionalId}/${patientId}/exams` : `${professionalId}/${patientId}`;
}

// Whether a path belongs to this practice's patient (and this kind).
export function pathBelongs(path: string, professionalId: string, patientId: string, kind?: FileKind): boolean {
  const parts = path.split("/");
  if (parts[0] !== professionalId || parts[1] !== patientId || parts.some((p) => p === "" || p === "." || p === "..")) return false;
  if (kind === "exams") return parts.length === 4 && parts[2] === "exams";
  if (kind === "files") return parts.length === 3;
  return parts.length === 3 || (parts.length === 4 && parts[2] === "exams");
}

export function isFileDeletable(createdAt: string, now = Date.now()): boolean {
  const t = Date.parse(createdAt);
  return !Number.isNaN(t) && now - t < DELETE_WINDOW_MS;
}

// A storage-safe name that keeps the user's name readable: no path
// separators or control characters, at most 120 characters, the extension
// kept. Never empty.
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFC").replace(/[\\/\u0000-\u001f\u007f]/g, "_").replace(/\s+/g, " ").trim();
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  const base = (ext ? cleaned.slice(0, dot) : cleaned).slice(0, 120 - ext.length).trim();
  return (base || "file") + ext;
}

// Another name when one is taken: "exam (2).pdf", "exam (3).pdf"…
export function withCounter(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}
