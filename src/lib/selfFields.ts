// 1.8.0 C2 (migration 212, flag patient_self_fields per doctor; ad): a linked
// patient completes the details their doctor requires that are still empty
// in the doctor's record, once (a non-blocking card; booking is never gated).
// The patient never sees the record's values; the server writes only
// required + still-empty fields (all or nothing) and logs the keys.
import type { FieldKey } from "@/lib/patientFields";

// 212's keys, in its form order (notes are never self-filled).
export const SELF_KEYS: readonly FieldKey[] = [
  "email", "birth_date", "national_id", "address", "emergency_contact", "insurance", "profession", "sex", "rg_passport", "cns",
];

export type SelfPrompt = { doctorId: string; doctorName: string; country: string; keys: FieldKey[]; prefill: Record<string, string> };

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

// One prompt per connected doctor with required, empty, self-fillable keys
// that the patient hasn't put off ("Agora não"). NULL / an error: no card.
export async function loadSelfFieldPrompts(db: Rpc, doctors: { id: string; name: string }[]): Promise<SelfPrompt[]> {
  const out: SelfPrompt[] = [];
  await Promise.all(doctors.map(async (d) => {
    try {
      const { data, error } = await db.rpc("get_my_missing_fields", { p_professional_id: d.id });
      if (error || !data || typeof data !== "object") return;
      const r = data as { country?: string; keys?: unknown; prefill?: unknown; prompted?: boolean };
      const keys = (Array.isArray(r.keys) ? r.keys : []).filter((k): k is FieldKey => (SELF_KEYS as readonly string[]).includes(k as string));
      if (!keys.length || r.prompted) return;
      // Strings as they are; the national ID comes as {cpf} (0f): its value under its input's name.
      const raw = (r.prefill ?? {}) as Record<string, unknown>;
      const prefill: Record<string, string> = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      const nid = raw.national_id;
      if (nid && typeof nid === "object") for (const [k, v] of Object.entries(nid as Record<string, unknown>)) if (typeof v === "string") prefill[k] = v;
      out.push({ doctorId: d.id, doctorName: d.name, country: r.country ?? "", keys, prefill });
    } catch {
      // No card for this doctor.
    }
  }));
  return out.sort((a, b) => doctors.findIndex((d) => d.id === a.doctorId) - doctors.findIndex((d) => d.id === b.doctorId));
}

const digits = (s: string) => s.replace(/\D/g, "");
const ADDRESS_PARTS = ["postal_code", "street", "number", "complement", "neighborhood", "city", "state"] as const;

// The form's inputs → 212's p_values: only the asked keys, only what was
// typed. The national ID by the practice country (Thailand: the Thai ID, or
// a passport instead); the address as its parts.
export function selfValues(keys: readonly FieldKey[], country: string, form: (name: string) => string): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  const get = (n: string) => (form(n) ?? "").trim();
  for (const k of keys) {
    switch (k) {
      case "national_id": {
        if (country === "BR") { if (get("cpf")) v.national_id = { cpf: digits(get("cpf")) }; }
        else if (country === "TH") {
          if (get("th_national_id")) v.national_id = { th_national_id: digits(get("th_national_id")) };
          else if (get("national_passport")) v.national_id = { passport_number: get("national_passport") };
        } else if (get("national_passport")) v.national_id = { passport_number: get("national_passport") };
        break;
      }
      case "address": {
        const a = Object.fromEntries(ADDRESS_PARTS.map((p) => [p, get(`address_${p}`)]).filter(([, x]) => x));
        if (a.street || a.city || a.postal_code) v.address = a;
        break;
      }
      case "cns": if (get("cns")) v.cns = digits(get("cns")); break;
      default: if (get(k)) v[k] = get(k);
    }
  }
  return v;
}

// The asked keys left without a value (checked before the server's own check).
export function selfMissing(keys: readonly FieldKey[], values: Record<string, unknown>): FieldKey[] {
  return keys.filter((k) => !(k in values));
}
