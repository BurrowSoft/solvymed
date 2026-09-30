// Merge duplicate patients (migration 133; UX 2026-09-30; the app's
// lib/patient-merge.ts): the doctor picks two records, sees only the fields
// that differ, picks a side for each, and the server moves everything onto
// the kept one (merge_patients). Doctor only.
import { ADDRESS_FIELDS, NOTES_ADMIN_MAX, type AddressColumns } from "./patientAddress";

export type MergeRow = {
  id: string; full_name: string; cpf: string | null; th_national_id: string | null; passport_number: string | null;
  birth_date: string | null; sex: string | null; phone: string | null; emergency_phone: string | null; email: string | null;
  rg: string | null; profession: string | null; convenio_type: string | null; photo_url: string | null;
  archived_at: string | null; booking_blocked: boolean | null;
  // For the cards' subtitles and the confirm sentence (recordMarks); never a merge field.
  created_at?: string | null; import_id?: string | null;
} & AddressColumns;

// The columns read for the comparison (never "*": nothing else leaks in).
export const MERGE_COLUMNS = "id, full_name, cpf, th_national_id, passport_number, birth_date, sex, phone, emergency_phone, email, rg, profession, convenio_type, photo_url, archived_at, booking_blocked, created_at, import_id";
// Once 138 + 139 are applied (patient-address-live): the address, CNS and
// Observações are compared and chosen too.
export const MERGE_ADDRESS_COLUMNS = `${ADDRESS_FIELDS.map((f) => f.name).join(", ")}, cns, notes_admin`;
export const mergeColumns = (address: boolean) => (address ? `${MERGE_COLUMNS}, ${MERGE_ADDRESS_COLUMNS}` : MERGE_COLUMNS);

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
];

// 139's choice keys: the address as ONE block (all 7 parts go together),
// the CNS, and Observações (which can also keep both).
// The 7 parts as one value, by position (a part moved to another field is
// a difference); null when all are empty (the app's rule, 38).
const addressBlock = (p: MergeRow) => {
  const parts = ADDRESS_FIELDS.map((f) => (p[f.name] ?? "").trim());
  return parts.some(Boolean) ? parts.join("\u0001") : null;
};
/** The address for display: the filled parts, in field order. */
export const addressDisplay = (p: MergeRow) => ADDRESS_FIELDS.map((f) => (p[f.name] ?? "").trim()).filter(Boolean).join(", ");
export const MERGE_ADDRESS_FIELDS = [
  { key: "address", get: addressBlock },
  { key: "cns", get: (p: MergeRow) => p.cns ?? null },
  { key: "notes_admin", get: (p: MergeRow) => p.notes_admin ?? null },
];
export type MergeFieldKey = string;
export type MergeField = { key: MergeFieldKey; get: (p: MergeRow) => string | null };
export const MERGE_FIELD_KEYS: readonly string[] = MERGE_FIELDS.map((f) => f.key);
export const MERGE_ADDRESS_KEYS: readonly string[] = MERGE_ADDRESS_FIELDS.map((f) => f.key);
/** The fields compared: the base ones, plus 139's once patient-address-live. */
export const mergeFields = (address: boolean): readonly MergeField[] => (address ? [...MERGE_FIELDS, ...MERGE_ADDRESS_FIELDS] : MERGE_FIELDS);

export type MergePick = "kept" | "merged" | "both";
// How merge_patients joins the two notes for 'both' (139, 38): kept first,
// newline + em dash + newline, then the removed record's; its length in
// characters must fit in 2,000 (else notes_too_long). Notes are stored
// trimmed (138), so no trim here. 'both' is only pre-selected when it fits.
export const NOTES_BOTH_SEP = "\n—\n";
export function notesFitBoth(kept: MergeRow, merged: MergeRow): boolean {
  const a = kept.notes_admin ?? "";
  const b = merged.notes_admin ?? "";
  // Array.from: length in characters (code points), like Postgres length().
  return Array.from(a + NOTES_BOTH_SEP + b).length <= NOTES_ADMIN_MAX;
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v == null ? "" : String(v));

/** The fields whose values differ between the two records, and how many are the same (filled on both). */
export function mergeDiff(a: MergeRow, b: MergeRow, fields: readonly MergeField[] = MERGE_FIELDS): { differing: MergeFieldKey[]; same: number } {
  const differing: MergeFieldKey[] = [];
  let same = 0;
  for (const f of fields) {
    const va = norm(f.get(a));
    const vb = norm(f.get(b));
    if (va === vb) { if (va) same++; } else differing.push(f.key);
  }
  return { differing, same };
}

/**
 * The side picked by default: an empty kept value with a filled one on the
 * other is taken; two different notes are kept together ('both') when they
 * fit in 2,000 characters, else the kept record's (the doctor is told).
 */
export function defaultPick(key: MergeFieldKey, kept: MergeRow, merged: MergeRow, fields: readonly MergeField[] = MERGE_FIELDS): MergePick {
  const f = fields.find((x) => x.key === key);
  if (!f) return "kept";
  const k = norm(f.get(kept)), m = norm(f.get(merged));
  if (!k && m) return "merged";
  if (key === "notes_admin" && k && m && k !== m && notesFitBoth(kept, merged)) return "both";
  return "kept";
}

/**
 * merge_patients' p_choices from the doctor's picks: a field is sent as
 * 'merged' only when they picked the removed record's value. An empty value
 * on the kept side with a filled one on the other is taken by default.
 * Observações always carries its pick ('kept' too): with no choice the
 * server joins the two when they fit (38).
 */
export function mergeChoices(kept: MergeRow, merged: MergeRow, picks: Partial<Record<MergeFieldKey, MergePick>>, fields: readonly MergeField[] = MERGE_FIELDS): Record<string, MergePick> {
  const out: Record<string, MergePick> = {};
  for (const f of fields) {
    if (norm(f.get(kept)) === norm(f.get(merged))) continue;
    const pick = picks[f.key] ?? defaultPick(f.key, kept, merged, fields);
    if (f.key === "notes_admin") out[f.key] = pick;
    else if (pick === "merged") out[f.key] = "merged";
  }
  return out;
}

/** The picks after swapping which record stays: each chosen value stays chosen (UX, the app's swapPicks). */
export function swapPicks(picks: Partial<Record<MergeFieldKey, MergePick>>): Partial<Record<MergeFieldKey, MergePick>> {
  const out: Partial<Record<MergeFieldKey, MergePick>> = {};
  for (const [k, v] of Object.entries(picks) as [MergeFieldKey, MergePick][]) {
    out[k] = v === "kept" ? "merged" : v === "merged" ? "kept" : v;
  }
  return out;
}

/**
 * What tells a record apart (UX; the app's recordMarks): its birth date, its
 * phone's last 4 digits, and when it was imported or added. Dates are
 * YYYY-MM-DD; the added date is the viewer's local day of created_at (an
 * imported record was created by the import, so that's its import date).
 */
export type RecordMark =
  | { kind: "birth"; date: string }
  | { kind: "phone"; last4: string }
  | { kind: "imported" | "created"; date: string };

export function recordMarks(p: MergeRow): RecordMark[] {
  const marks: RecordMark[] = [];
  if (p.birth_date) marks.push({ kind: "birth", date: p.birth_date.slice(0, 10) });
  const digits = (p.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) marks.push({ kind: "phone", last4: digits.slice(-4) });
  const d = new Date(p.created_at ?? "");
  if (!isNaN(d.getTime())) {
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    marks.push({ kind: p.import_id ? "imported" : "created", date: day });
  }
  return marks;
}

const markValue = (m: RecordMark) => ("last4" in m ? m.last4 : m.date);
const markGroup = (m: RecordMark) => (m.kind === "imported" ? "created" : m.kind);

/**
 * The confirm sentence names two same-name records by the first mark that
 * differs between them (birth date, then phone, then imported/added date);
 * if none does, by the added date (UX). Null when the names already differ.
 */
export function distinguishingMarks(a: MergeRow, b: MergeRow): [RecordMark, RecordMark] | null {
  if (norm(a.full_name) !== norm(b.full_name)) return null;
  const ma = recordMarks(a);
  const mb = recordMarks(b);
  for (const x of ma) {
    const y = mb.find((m) => markGroup(m) === markGroup(x));
    if (y && (markValue(x) !== markValue(y) || x.kind !== y.kind)) return [x, y];
  }
  const ca = ma.find((m) => markGroup(m) === "created");
  const cb = mb.find((m) => markGroup(m) === "created");
  return ca && cb ? [ca, cb] : null;
}

export type MergePreviewSide = { appointments: number; records: number; prescriptions: number; files: number; hasAppAccount: boolean };

export type MergeErrorCode = "both_have_app_accounts" | "app_account_confirmation_required" | "kept_patient_archived" | "merged_patient_deceased" | "notes_too_long" | "not_allowed" | "not_found" | "invalid" | "generic";
export const MERGE_ERRORS: MergeErrorCode[] = ["both_have_app_accounts", "app_account_confirmation_required", "kept_patient_archived", "merged_patient_deceased", "notes_too_long", "not_allowed", "not_found", "invalid"];
