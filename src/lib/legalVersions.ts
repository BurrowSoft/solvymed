// The current versions (dates) of the Privacy Policy and the Terms of Use
// (Sprint TH, TH-3). One source for the pages' "Last updated" line and for
// what a signup records as accepted (migration 111: privacy_consents, via
// handle_new_user; it only records versions in its _privacy_versions()
// list). A new text = a new date here AND a migration adding it to that
// list (mobile dev), shipped together.
export const PRIVACY_VERSION = "2026-09-28";
export const TERMS_VERSION = "2026-10-01";

// Sent with every web signup (the checkbox is required, so it's sent only
// on acceptance).
export function consentMetadata() {
  return { privacy_version: PRIVACY_VERSION, terms_version: TERMS_VERSION, privacy_consent_platform: "web" as const };
}

// "September 28, 2026" / "28 de setembro de 2026" (the legal pages are in
// English or Brazilian Portuguese).
export function legalDateLabel(lang: "en" | "pt-BR", version: string): string {
  const [y, m, d] = version.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "pt-BR" ? "pt-BR" : "en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
