// The printed prescription on the website (Help P6), laid out like the
// app's PDF (lib/pdf-utils buildPrescriptionHtml): the clinic's document
// template (colours, logo, header and footer texts), the patient, the date,
// the medications table and the notes. The signature is a blank line with
// the doctor's name and council registration under it, to be signed by
// hand (UX 36: the app's drawn signature lives on the phone only).

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
