// Endereço, CNS e observações no cadastro (migration 138). All optional text
// on public.patients, under the existing patient RLS (doctor + secretary).
// The server trims, turns "" into NULL and checks the CNS (BR practices
// only: 'cns_not_used' elsewhere, 'invalid_cns' on a bad check); these
// helpers mirror that so the form can say so before saving.

import { profileOfKind } from "./country";
import type { PatientIdKind } from "./patientIds";

export const ADDRESS_FIELDS = [
  { name: "address_postal_code", max: 20 },
  { name: "address_street", max: 200 },
  { name: "address_number", max: 20 },
  { name: "address_complement", max: 100 },
  { name: "address_neighborhood", max: 100 },
  { name: "address_city", max: 100 },
  { name: "address_state", max: 60 },
] as const;
export type AddressField = (typeof ADDRESS_FIELDS)[number]["name"];
export const NOTES_ADMIN_MAX = 2000;

// The form marks that it showed these fields: only then does a save write
// them (a form without the section must never clear stored values, and
// nothing is written before 138 exists).
export const ADDRESS_MARKER = "address_fields";

export type AddressColumns = Partial<Record<AddressField | "cns" | "notes_admin", string | null>>;

const clean = (v: FormDataEntryValue | null, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

// The CNS as the server stores it: 15 digits.
export const cnsDigits = (v: string) => v.replace(/\D/g, "");

// The official check: 15 digits starting 1, 2, 7, 8 or 9, and the digits
// times the weights 15..1 add up to a multiple of 11.
export function isValidCns(value: string): boolean {
  const d = cnsDigits(value);
  if (!/^[12789]\d{14}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += Number(d[i]) * (15 - i);
  return sum % 11 === 0;
}

// kind: the practice's kind (lib/patientIds: BR / TH / OTHER), as the
// callers have it; anything else is the OTHER default, never Brazil.
const profileOf = (kind: string) => profileOfKind(kind as PatientIdKind);

// The columns to write, or null when the form didn't show the section.
// The CNS is only read where the country has it (Brazil; the server refuses
// it elsewhere); an empty field clears it.
export function readAddress(formData: FormData, kind: string): AddressColumns | null {
  if (formData.get(ADDRESS_MARKER) !== "1") return null;
  const out: AddressColumns = {};
  for (const f of ADDRESS_FIELDS) out[f.name] = clean(formData.get(f.name), f.max);
  out.notes_admin = clean(formData.get("notes_admin"), NOTES_ADMIN_MAX);
  if (profileOf(kind).healthCard === "cns") {
    const cns = clean(formData.get("cns"), 40);
    out.cns = cns ? cnsDigits(cns) : null;
  }
  return out;
}

export function addressError(cols: AddressColumns | null): "invalid_cns" | null {
  return cols?.cns && !isValidCns(cols.cns) ? "invalid_cns" : null;
}

const join = (parts: (string | null | undefined)[], sep: string) => parts.filter((s) => !!s && s.trim()).join(sep);

// One line for the prescription print and the patient page's summary, in
// the practice country's order (UX): empty parts are skipped. Empty when
// neither the street nor the city is filled (then nothing is printed).
//   BR:    Rua X, 123, apto 4 – Bairro – Cidade/UF – CEP 01234-567
//   TH:    house number, building, street/soi, subdistrict, district, province, postal code
//   other: street, number, complement – neighbourhood – city, state – postal code
export function addressLine(p: AddressColumns, kind: string): string {
  if (!p.address_street?.trim() && !p.address_city?.trim()) return "";
  const format = profileOf(kind).addressFormat;
  if (format === "th") {
    return join([p.address_number, p.address_complement, p.address_street, p.address_neighborhood, p.address_city, p.address_state, p.address_postal_code], ", ");
  }
  const first = join([p.address_street, p.address_number, p.address_complement], ", ");
  if (format === "br") {
    return join([first, p.address_neighborhood, join([p.address_city, p.address_state], "/"), p.address_postal_code ? `CEP ${p.address_postal_code}` : null], " – ");
  }
  return join([first, p.address_neighborhood, join([p.address_city, p.address_state], ", "), p.address_postal_code], " – ");
}
