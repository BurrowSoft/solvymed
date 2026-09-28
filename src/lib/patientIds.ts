import { countryProfile } from "./country";

// Patient identifiers by the PRACTICE's country (Sprint TH, TH-1; migration
// 110), never the UI language:
//   Brazil  - CPF (as before)
//   Thailand - Thai national ID (13 digits, checksum, optional) and/or a
//             passport number (optional)
//   Other   - a passport / ID number (free text, optional)
// Only the columns of the practice's country are ever written, so a
// Brazilian practice (every practice until 110 is applied) sends exactly
// what it did before and never touches the new columns.

export type PatientIdKind = "BR" | "TH" | "OTHER";

export type PatientIdColumns =
  | { cpf: string | null }
  | { th_national_id: string | null; passport_number: string | null }
  | { passport_number: string | null };

export function patientIdKind(country: string | null | undefined): PatientIdKind {
  return countryProfile(country).kind;
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

// The Thai ID checksum, as the database checks it (migration 110):
// sum(d[i] * (14 - i)) for i = 1..12, then (11 - sum % 11) % 10 = d[13].
export function isValidThaiId(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

// Whether a patient form was rendered for this identifier kind. The pages
// pick the fields with the display lookup (BR on an error) while the
// actions write with the strict one, so a form shown with the wrong fields
// (e.g. CPF only for a Thai practice after a transient error) would save
// NULL over the stored Thai ID/passport. The forms send the kind they
// rendered as a hidden id_kind; a missing or different one is refused.
export function formIdKindMatches(formData: FormData, kind: PatientIdKind): boolean {
  return formData.get("id_kind") === kind;
}

// The columns to write from a patient form, for the practice's country.
export function readPatientIds(formData: FormData, kind: PatientIdKind): PatientIdColumns {
  if (kind === "BR") return { cpf: text(formData.get("cpf")) || null };
  const passport = text(formData.get("passport_number")).slice(0, 30) || null;
  if (kind === "TH") {
    const th = digitsOnly(text(formData.get("th_national_id")));
    return { th_national_id: th || null, passport_number: passport };
  }
  return { passport_number: passport };
}

// A Thai ID that fails the checksum (checked before saving, with the same
// rule the database enforces as 'invalid_th_id').
export function patientIdError(ids: PatientIdColumns): "invalid_th_id" | null {
  if ("th_national_id" in ids && ids.th_national_id && !isValidThaiId(ids.th_national_id)) return "invalid_th_id";
  return null;
}

// find_similar_patients arguments for the identifiers: only the ones that
// are set, so the call keeps matching the pre-110 function signature for a
// Brazilian practice.
export function similarPatientArgs(ids: PatientIdColumns): Record<string, string> {
  const out: Record<string, string> = {};
  if ("cpf" in ids && ids.cpf) out.p_cpf = ids.cpf;
  if ("th_national_id" in ids && ids.th_national_id) out.p_th_national_id = ids.th_national_id;
  if ("passport_number" in ids && ids.passport_number) out.p_passport_number = ids.passport_number;
  return out;
}

const normPassport = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// Whether a find_similar_patients row is the one whose identifier collided
// (the RPC also returns name/phone matches).
export function sameIdentifier(
  ids: PatientIdColumns,
  row: { cpf?: string | null; th_national_id?: string | null; passport_number?: string | null },
): boolean {
  if ("cpf" in ids && ids.cpf && digitsOnly(row.cpf ?? "") === digitsOnly(ids.cpf)) return true;
  if ("th_national_id" in ids && ids.th_national_id && digitsOnly(row.th_national_id ?? "") === ids.th_national_id) return true;
  if ("passport_number" in ids && ids.passport_number && normPassport(row.passport_number) === normPassport(ids.passport_number)) return true;
  return false;
}

export function hasAnyIdentifier(ids: PatientIdColumns): boolean {
  return Object.values(ids).some((v) => !!v);
}
