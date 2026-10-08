// 1.8.0 C1 (migration 207, cf): which patient details a practice asks for.
// professionals.patient_fields = { field: 'required' | 'optional' | 'hidden' };
// get_patient_fields returns the full map for the practice's country with
// defaults filled in (a missing key = optional, except Brazil's
// rg_passport = hidden). Name is always required and not listed; phone is optional everywhere (b2 10-08).
// Forms only: hidden = not shown (what's saved stays), required = an
// asterisk and checked on save; imports and merges are untouched.

export const FIELD_KEYS = [
  "email", "birth_date", "national_id", "rg_passport", "sex", "profession",
  "address", "emergency_contact", "insurance", "notes", "cns",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldRule = "required" | "optional" | "hidden";
export type PatientFieldRules = Partial<Record<FieldKey, FieldRule>>;

const RULES: readonly FieldRule[] = ["required", "optional", "hidden"];

// The keys a practice country has (CNS is Brazil's), in the Settings order.
export function fieldsFor(country: string | null | undefined): FieldKey[] {
  return FIELD_KEYS.filter((k) => k !== "cns" || country === "BR");
}

// A key's rule, with 207's defaults when the map lacks it.
export function ruleOf(rules: PatientFieldRules | null, key: FieldKey, country: string | null | undefined): FieldRule {
  const r = rules?.[key];
  if (r && RULES.includes(r)) return r;
  return key === "rg_passport" && country === "BR" ? "hidden" : "optional";
}

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

// The practice's rules (any role that can read them), or null on any error:
// the forms then fall back to today's (everything optional, no RG field).
export async function readPatientFieldRules(db: Rpc, professionalId: string): Promise<PatientFieldRules | null> {
  try {
    const { data, error } = await db.rpc("get_patient_fields", { p_professional_id: professionalId });
    if (error || !data || typeof data !== "object") return null;
    const out: PatientFieldRules = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if ((FIELD_KEYS as readonly string[]).includes(k) && RULES.includes(v as FieldRule)) out[k as FieldKey] = v as FieldRule;
    }
    return out;
  } catch {
    return null;
  }
}

// Today's form when the rules can't be read (fail open): everything shown
// and optional, except Brazil's new RG field.
export function failOpenRules(country: string | null | undefined): PatientFieldRules {
  return Object.fromEntries(fieldsFor(country).map((k) => [k, ruleOf(null, k, country)])) as PatientFieldRules;
}

// The form inputs each key covers (a practice country's identifier columns).
export function inputsOf(key: FieldKey, country: string | null | undefined): string[] {
  switch (key) {
    case "national_id": return country === "BR" ? ["cpf"] : country === "TH" ? ["th_national_id"] : ["passport_number"];
    case "rg_passport": return country === "BR" ? ["rg"] : ["passport_number"];
    case "address": return ["address_postal_code", "address_street", "address_number", "address_complement", "address_neighborhood", "address_city", "address_state"];
    case "emergency_contact": return ["emergency_phone"];
    case "insurance": return ["convenio_type"];
    case "notes": return ["notes_admin"];
    default: return [key];
  }
}

// Whether a key has a value. In Thailand a passport fills a required
// national ID (cf, 6 Oct; Brazil stays CPF only); the address counts once
// any part is filled.
export function filled(key: FieldKey, values: Record<string, string | null | undefined>, country: string | null | undefined): boolean {
  const has = (n: string) => !!(values[n] ?? "").toString().trim();
  if (key === "national_id" && country === "TH" && has("passport_number")) return true;
  return inputsOf(key, country).some(has);
}

// The required keys left empty. On an edit (`before` given), only the ones
// that HAD a value block the save; the ones already empty are reported
// apart, as a note (cf, 6 Oct).
export function missingRequired(
  rules: PatientFieldRules | null,
  values: Record<string, string | null | undefined>,
  country: string | null | undefined,
  before?: Record<string, string | null | undefined>,
): { blocking: FieldKey[]; note: FieldKey[] } {
  const blocking: FieldKey[] = [];
  const note: FieldKey[] = [];
  for (const k of fieldsFor(country)) {
    if (ruleOf(rules, k, country) !== "required" || filled(k, values, country)) continue;
    if (before && !filled(k, before, country)) note.push(k);
    else blocking.push(k);
  }
  return { blocking, note };
}
