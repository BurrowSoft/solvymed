// Stable error codes the database raises (migration 094, patient archive)
// that the UI must show as translated copy, never as the raw message.
export type KnownDbError = "patient_archived" | "patient_has_clinical_history";

const KNOWN: KnownDbError[] = ["patient_archived", "patient_has_clinical_history"];

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
