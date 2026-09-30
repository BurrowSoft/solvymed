// The patient list as a spreadsheet (Help P10), like the app's lib/csv:
// every cell quoted, a formula-looking value neutralised, ";" where the
// language writes decimals with a comma (Excel's list separator there), a
// UTF-8 BOM so accents open right, the practice country's ID columns, and
// dates in the practice country's format (lib/prescriptionDoc docDate).
import { countryProfile } from "./country";
import { docDate } from "./prescriptionDoc";
import { dateLocale } from "./dateLabels";
import { ADDRESS_FIELDS, type AddressColumns } from "./patientAddress";

// Values a spreadsheet would run as a formula (=, +, -, @, tab, CR first)
// get an apostrophe, so a name like "=HYPERLINK(...)" can't execute.
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][], separator: "," | ";" = ","): string {
  return rows.map((row) => row.map(csvCell).join(separator)).join("\r\n");
}

export function csvSeparator(locale: string): "," | ";" {
  try {
    return new Intl.NumberFormat(dateLocale(locale)).format(1.5).includes(",") ? ";" : ",";
  } catch {
    return ",";
  }
}

export type CsvPatient = {
  full_name: string; cpf?: string | null; th_national_id?: string | null; passport_number?: string | null;
  sex?: string | null; birth_date?: string | null; phone?: string | null; email?: string | null;
  profession?: string | null; tags?: unknown; archived_at?: string | null;
} & AddressColumns;

// Exactly what the export reads from patients: the CsvPatient fields + id
// (for the access log). Never "*": a new column (imported data, notes, …)
// stays out of the file until it's added here on purpose.
export const CSV_COLUMNS = "id, full_name, cpf, th_national_id, passport_number, sex, birth_date, phone, email, profession, tags, archived_at";
// With 138 + 139 (patient-address-live): the address and the CNS too (UX:
// never Observações, it's free text).
export const csvColumns = (address: boolean) => (address ? `${CSV_COLUMNS}, ${ADDRESS_FIELDS.map((f) => f.name).join(", ")}, cns` : CSV_COLUMNS);

export type CsvLabels = {
  fullName: string; cpf: string; thaiId: string; passport: string; sex: string; birthDate: string; phone: string;
  email: string; profession: string; tags: string; archivedOn: string; male: string; female: string; other: string;
  // The 7 address parts in ADDRESS_FIELDS order (the practice country's labels) and the CNS; present = the columns are exported.
  address?: string[]; cns?: string;
};

export function patientsCsv(patients: CsvPatient[], labels: CsvLabels, country: string, locale: string): string {
  // The practice country's ID columns (lib/country idFields).
  const ids = countryProfile(country).idFields.map((f) => f.name);
  const idHeader = { cpf: labels.cpf, th_national_id: labels.thaiId, passport_number: labels.passport };
  const sex = (s?: string | null) => (s === "male" ? labels.male : s === "female" ? labels.female : s === "other" ? labels.other : "");
  const date = (iso?: string | null) => (iso ? docDate(country, iso.slice(0, 10)) : "");
  const addr = labels.address?.length === ADDRESS_FIELDS.length ? ADDRESS_FIELDS.map((f) => f.name) : [];
  const withCns = !!labels.cns && countryProfile(country).healthCard === "cns";
  const headers = [labels.fullName, ...ids.map((f) => idHeader[f]), labels.sex, labels.birthDate, labels.phone, labels.email, labels.profession, labels.tags, labels.archivedOn,
    ...(addr.length ? labels.address! : []), ...(withCns ? [labels.cns!] : [])];
  const rows = patients.map((p) => [
    p.full_name,
    ...ids.map((f) => p[f] ?? ""),
    sex(p.sex),
    date(p.birth_date),
    p.phone ?? "",
    p.email ?? "",
    p.profession ?? "",
    Array.isArray(p.tags) ? p.tags.join(", ") : "",
    date(p.archived_at),
    ...addr.map((f) => p[f] ?? ""),
    ...(withCns ? [p.cns ?? ""] : []),
  ]);
  return "\uFEFF" + toCsv([headers, ...rows], csvSeparator(locale));
}
