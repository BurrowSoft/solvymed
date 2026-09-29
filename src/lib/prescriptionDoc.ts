// The printed prescription on the website (Help P6), laid out like the
// app's PDF (lib/pdf-utils buildPrescriptionHtml): the clinic's document
// template (colours, logo, header and footer texts), the patient, the date,
// the medications table and the notes. The signature is a blank line with
// the doctor's name and council registration under it, to be signed by
// hand (UX 36: the app's drawn signature lives on the phone only).

// Print views: only #print-doc prints, on A4. The dashboard's nav, the
// toolbar (.print-hide) and any floating button stay off the page, and
// colours print as on screen.
export const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; }
  #print-doc, #print-doc * { visibility: visible !important; }
  #print-doc { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-hide { display: none !important; }
}`;

// Printed documents take their dates from the PRACTICE's country, not the
// screen's language (UX 36 / TH rule 5): dd/mm/yyyy everywhere, in the
// Buddhist era (+543) for a Thai practice. The labels stay in the UI
// language.
export function docDate(country: string, isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const year = Number(m[1]) + (country === "TH" ? 543 : 0);
  return `${m[3]}/${m[2]}/${year}`;
}

// A stored time ("9:05", "09:05:00") as HH:MM.
export function docTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h = "0", mm = "00"] = time.split(":");
  return `${h.padStart(2, "0")}:${mm.padStart(2, "0").slice(0, 2)}`;
}

// Today's date in the clinic's time zone, as docDate.
export function docToday(country: string, timeZone: string, now = new Date()): string {
  let iso: string;
  try {
    iso = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    iso = now.toISOString().slice(0, 10);
  }
  return docDate(country, iso);
}

// A light tint of the accent for zebra rows and the notes box, so dark
// text stays readable whatever accent the clinic picked (web tester 2).
export function tint(color: string): string {
  return `color-mix(in srgb, ${color} 18%, white)`;
}

export type DocTemplate = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
};

export const DEFAULT_TEMPLATE: DocTemplate = {
  primaryColor: "#208AEF",
  accentColor: "#E8F4FE",
  logoUrl: null,
  headerText: null,
  footerText: null,
};

// Colours go into CSS: only #hex values (like the app).
export function cssColor(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
}

// A logo only from https (the public document-logos bucket).
export function safeLogoUrl(v: unknown): string | null {
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

// A document_templates row (or none) as a safe template.
export function toDocTemplate(row: Record<string, unknown> | null | undefined): DocTemplate {
  if (!row) return DEFAULT_TEMPLATE;
  return {
    primaryColor: cssColor(row.primary_color, DEFAULT_TEMPLATE.primaryColor),
    accentColor: cssColor(row.accent_color, DEFAULT_TEMPLATE.accentColor),
    logoUrl: safeLogoUrl(row.logo_url),
    headerText: text(row.header_text),
    footerText: text(row.footer_text),
  };
}
