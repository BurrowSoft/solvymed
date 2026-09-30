// Merge duplicate patients (migration 133; UX 2026-09-30; the app's
// lib/patient-merge.ts): the doctor picks two records, sees only the fields
// that differ, picks a side for each, and the server moves everything onto
// the kept one (merge_patients). Doctor only.

export type MergeRow = {
  id: string; full_name: string; cpf: string | null; th_national_id: string | null; passport_number: string | null;
  birth_date: string | null; sex: string | null; phone: string | null; emergency_phone: string | null; email: string | null;
  rg: string | null; profession: string | null; convenio_type: string | null; photo_url: string | null;
  archived_at: string | null; booking_blocked: boolean | null;
};

// The columns read for the comparison (never "*": nothing else leaks in).
export const MERGE_COLUMNS = "id, full_name, cpf, th_national_id, passport_number, birth_date, sex, phone, emergency_phone, email, rg, profession, convenio_type, photo_url, archived_at, booking_blocked";

// The fields the comparison shows, in order; `key` is merge_patients' choice key.
export const MERGE_FIELDS = [
  { key: "full_name", get: (p: MergeRow) => p.full_name },
  { key: "cpf", get: (p: MergeRow) => p.cpf },
  { key: "th_national_id", get: (p: MergeRow) => p.th_national_id },
  { key: "passport_number", get: (p: MergeRow) => p.passport_number },
  { key: "birth_date", get: (p: MergeRow) => p.birth_date },
  { key: "sex", get: (p: MergeRow) => p.sex },
  { key: "phone", get: (p: MergeRow) => p.phone },
  { key: "emergency_phone", get: (p: MergeRow) => p.emergency_phone },
  { key: "email", get: (p: MergeRow) => p.email },
  { key: "rg", get: (p: MergeRow) => p.rg },
  { key: "profession", get: (p: MergeRow) => p.profession },
  { key: "convenio_type", get: (p: MergeRow) => p.convenio_type },
  { key: "photo", get: (p: MergeRow) => p.photo_url },
] as const;
export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];
export const MERGE_FIELD_KEYS: readonly string[] = MERGE_FIELDS.map((f) => f.key);

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v == null ? "" : String(v));

/** The fields whose values differ between the two records, and how many are the same (filled on both). */
export function mergeDiff(a: MergeRow, b: MergeRow): { differing: MergeFieldKey[]; same: number } {
  const differing: MergeFieldKey[] = [];
  let same = 0;
  for (const f of MERGE_FIELDS) {
    const va = norm(f.get(a));
    const vb = norm(f.get(b));
    if (va === vb) { if (va) same++; } else differing.push(f.key);
  }
  return { differing, same };
}

/**
 * merge_patients' p_choices from the doctor's picks: a field is sent as
 * 'merged' only when they picked the removed record's value. An empty value
 * on the kept side with a filled one on the other is taken by default.
 */
export function mergeChoices(kept: MergeRow, merged: MergeRow, picks: Partial<Record<MergeFieldKey, "kept" | "merged">>): Record<string, "merged"> {
  const out: Record<string, "merged"> = {};
  for (const f of MERGE_FIELDS) {
    const pick = picks[f.key] ?? (!norm(f.get(kept)) && norm(f.get(merged)) ? "merged" : "kept");
    if (pick === "merged" && norm(f.get(kept)) !== norm(f.get(merged))) out[f.key] = "merged";
  }
  return out;
}

export type MergePreviewSide = { appointments: number; records: number; prescriptions: number; files: number; hasAppAccount: boolean };

export type MergeErrorCode = "both_have_app_accounts" | "app_account_confirmation_required" | "kept_patient_archived" | "merged_patient_deceased" | "not_allowed" | "not_found" | "invalid" | "generic";
export const MERGE_ERRORS: MergeErrorCode[] = ["both_have_app_accounts", "app_account_confirmation_required", "kept_patient_archived", "merged_patient_deceased", "not_allowed", "not_found", "invalid"];
