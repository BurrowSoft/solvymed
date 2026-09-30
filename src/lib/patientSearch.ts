import type { PatientIdKind } from "./patientIds";
import { profileOfKind } from "./country";

// Server-side patient search and paging (the patient list, the appointment
// picker). Supabase caps a response at 1000 rows, so lists are paged and
// searched in the database, never loaded whole.

export const PATIENTS_PAGE_SIZE = 50;
export const PICKER_LIMIT = 20;

// What a search box may pass into a PostgREST filter: letters (any
// script) with their combining marks, digits, spaces and the few symbols
// names, CPFs and phones use. Everything else (commas, parentheses,
// quotes, backslashes, wildcards) is dropped, so the text can't change the
// filter's structure. The marks (\p{M}) matter: Thai vowels and tone marks
// (้ ี ั ์ …) are combining marks, and dropping them made "แก้วมณี" search
// for "แก ว มณ" and find nothing (d7). NFC first, so a decomposed "José"
// becomes the stored "José".
export function cleanSearchText(q: string): string {
  return q
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} .'@+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// The PostgREST `or` filter for a search: the name contains the text, or,
// with 3+ digits typed, the phone or the practice country's ID number
// contains those digits in order with only separators between them
// ("123.456" matches "123456" and "123 456"); a passport matches as text.
// Only the country's own ID columns are searched (lib/patientIds): a
// Brazilian practice (all of them before migration 110) searches CPF as
// before and never names the new columns. Null when there's nothing to
// search for.
export function patientSearchFilter(q: string | null | undefined, idKind: PatientIdKind = "BR"): string | null {
  const text = cleanSearchText(q ?? "");
  if (!text) return null;
  const clauses = [`full_name.ilike."*${text}*"`];
  const digits = text.replace(/\D/g, "");
  // The practice country's ID columns (lib/country idFields), each matched
  // as its field says.
  const idFields = profileOfKind(idKind).idFields;
  if (digits.length >= 3) {
    const pattern = digits.split("").join("[^0-9]*");
    clauses.push(`phone.imatch."${pattern}"`);
    for (const f of idFields) if (f.search === "digits") clauses.push(`${f.name}.imatch."${pattern}"`);
  }
  if (text.length >= 3) for (const f of idFields) if (f.search === "text") clauses.push(`${f.name}.ilike."*${text}*"`);
  return clauses.join(",");
}

// 1-based page from a query-string value; anything invalid is page 1.
export function parsePage(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

export function pageRange(page: number, size = PATIENTS_PAGE_SIZE): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}
