// Stable error codes the database raises that the UI must show as
// translated copy, never as the raw message: patient archive (094) and the
// 24-hour correction rule for clinical records (097) and closing an
// account (102).
export type KnownDbError =
  | "patient_archived"
  | "patient_has_clinical_history"
  | "clinical_record_locked"
  | "reason_required"
  | "content_required"
  | "record_not_found"
  | "prescription_not_found"
  | "subscription_active"
  | "invalid_th_id"
  | "invalid_birth_date"
  | "invalid_cns"
  | "id_conflict"
  | "demo_not_allowed";

const KNOWN: KnownDbError[] = [
  "patient_archived",
  "patient_has_clinical_history",
  "clinical_record_locked",
  "reason_required",
  "content_required",
  "record_not_found",
  "prescription_not_found",
  "subscription_active",
  // Thai national ID failing its checksum (110).
  "invalid_th_id",
  // A birth date outside 1900..today (116).
  "invalid_birth_date",
  // A CNS failing its check (138).
  "invalid_cns",
  // A save's id already belongs to something else (216, saving once): the
  // form takes a new id; shown as the generic error.
  "id_conflict",
  // A demo can't do this (234 §5): the page shows "Disponível na sua conta".
  "demo_not_allowed",
];

// The code when a Postgres/PostgREST error message carries one, else null.
export function knownDbError(message: string | null | undefined): KnownDbError | null {
  if (!message) return null;
  return KNOWN.find((code) => message.includes(code)) ?? null;
}

// For server actions that return `{ error: string }`: the stable code when
// there is one (so the client can translate it), otherwise the message.
export function actionError(message: string | null | undefined): string {
  return knownDbError(message) ?? message ?? "generic";
}
