// The patient list as a spreadsheet (Help P10), like the app's lib/csv:
// every cell quoted, a formula-looking value neutralised, ";" where the
// language writes decimals with a comma (Excel's list separator there), a
// UTF-8 BOM so accents open right, the practice country's ID columns, and
// dates in the practice country's format (lib/prescriptionDoc docDate).
import { docDate } from "./prescriptionDoc";
import { dateLocale } from "./dateLabels";

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
};

export type CsvLabels = {
  fullName: string; cpf: string; thaiId: string; passport: string; sex: string; birthDate: string; phone: string;
  email: string; profession: string; tags: string; archivedOn: string; male: string; female: string; other: string;
};

export function patientsCsv(patients: CsvPatient[], labels: CsvLabels, country: string, locale: string): string {
  const ids: ("cpf" | "th_national_id" | "passport_number")[] =
    country === "BR" ? ["cpf"] : country === "TH" ? ["th_national_id", "passport_number"] : ["passport_number"];
  const idHeader = { cpf: labels.cpf, th_national_id: labels.thaiId, passport_number: labels.passport };
  const sex = (s?: string | null) => (s === "male" ? labels.male : s === "female" ? labels.female : s === "other" ? labels.other : "");
  const date = (iso?: string | null) => (iso ? docDate(country, iso.slice(0, 10)) : "");
  const headers = [labels.fullName, ...ids.map((f) => idHeader[f]), labels.sex, labels.birthDate, labels.phone, labels.email, labels.profession, labels.tags, labels.archivedOn];
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
  ]);
  return "\uFEFF" + toCsv([headers, ...rows], csvSeparator(locale));
}
