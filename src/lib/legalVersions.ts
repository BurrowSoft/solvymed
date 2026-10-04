// The current versions (dates) of the Privacy Policy and the Terms of Use
// (Sprint TH, TH-3). One source for the pages' "Last updated" line and for
// what a signup records as accepted (migration 111: privacy_consents, via
// handle_new_user; it only records versions in its _privacy_versions()
// list). A new text = a new date here AND a migration adding it to that
// list (mobile dev), shipped together.
// 2026-10-01: §6e names WhatsApp (whatsapp-outbox-live). Needs mobile's
// migration adding ('privacy','2026-10-01') applied FIRST.
// 2026-10-02: §3.7 secretary invitations + the Resend row name invites
// (secretary-invite-email-live). Mobile 156 accepts it (applied first).
// 2026-10-03: §6d Founders Program applications (liveFeatures.founders).
// Mobile's migration adding ('privacy','2026-10-03') applied FIRST.
// 2026-10-05: §6f My brand (1.5.0, live in the app): what's stored, the
// logo and photo public once saved, removal within about a minute, legacy
// photos private. Mobile's migration 169 adding ('privacy','2026-10-05')
// applied FIRST.
export const PRIVACY_VERSION = "2026-10-05";
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
  return new Intl.DateTimeFormat(lang === "pt-BR" ? "pt-BR" : "en-GB", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
