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
// 2026-10-06: §6g Notifications (1.6.0): appointment notices and the
// professional's general notices, delivery through Expo, the server queue's
// 30-day deletion, turning them off. Mobile's migration adding
// ('privacy','2026-10-06') applied FIRST (174). The closure-notice line
// was hidden behind closure-notices-live then, with its own bump below.
// 2026-10-07: §6g's closure-notice line revealed (closure-notices-live):
// 173 live and the website's own closure pushes removed (#378 deployed).
// Mobile's migration 175 adding ('privacy','2026-10-07') applied FIRST.
// 2026-10-08: §5 Resend also sends alerts to our support team about an
// account (the deletion-request alert; 177's WhatsApp-setting alert). Mobile's
// accepting migration for ('privacy','2026-10-08') applied FIRST. (The LINE
// lines now name the doctor too, for 168; still hidden behind line-live.)
// 2026-10-09: §3.6 names what marketing attribution saves (campaign/UTM, the
// referring site, the first page and when) and where: with the account at
// signup and, while the Founders page is live, with a Founders application
// (its retention, as 129's purge). True today (signups since 100/104,
// applications' utm since 129; cf/c6); and, with 187, that it waits with the
// pending signup until the email is confirmed (30 days at most). Mobile's
// accepting migration (184) for
// ('privacy','2026-10-09') applied FIRST.
// 2026-10-10: §10b Thailand (PDPA): the PDPA's roles, legal bases, sensitive
// data, transfers, rights, breaches, minors (Vitor's "OK PDPA text", via cf;
// trimmed to what is true today: no DPO appointment, deadline or Thai
// retention period promised). Mobile's accepting migration (197) for
// ('privacy','2026-10-10') applied FIRST.
// 2026-10-12: SolvyAI live (solvyai-live): §5 Anthropic (USA) row, §6b and
// Anthropic's retention in §6 (Vitor's "go SolvyAI", via cf). Mobile's
// accepting migration (198) for ('privacy','2026-10-12') applied FIRST.
// 2026-10-13: §3.2 lists every patient field stored or collected (RG,
// profession, emergency contact phone, insurance type, photo, tags, archive status; c6/cf, text =
// enforcement). Mobile's accepting migration for ('privacy','2026-10-13')
// applied FIRST.
// 2026-10-16: §3.1 names a tax ID per country (CNPJ / the Thai 13-digit tax
// ID), the Pix key or PromptPay ID, and the card payment link (1.8.0 E;
// Vitor's "OK privacy 3.1 B", via b2). Merged with the card-payment-live
// flip, so the link can be entered from the moment the text says so.
// Mobile's accepting migration for ('privacy','2026-10-16') applied FIRST.
// 2026-10-17: the 1.8.0 release (Vitor's "OK privacy 1.8.0", via b2): §3.8
// documents shared with patients + the §6g / §7 lines (patient-documents-live),
// certificates, declarations and exam requests among clinical records
// (clinical-documents-live), and §3.2's patients completing their own details
// (c2-patient-step-live; "OK privacy C2"). One version for all three, merged
// with their flips. Mobile's accepting migration (215) applied FIRST.
// 2026-10-19: §3.8 the app's drawn signature on documents (kept on the phone,
// in issued documents and their shared copies; Vitor's "OK privacy
// signature", 10-13, with c5's corrections: the document list and the phone's
// own backup). The §5 Sentry row stays "app and website": no edge function
// reports to Sentry yet (c5, 10-13); naming them waits for c5's edge scrub
// PR and its own wording step. Mobile 219 (accepting 2026-10-19) applied FIRST.
export const PRIVACY_VERSION = "2026-10-19";
export const TERMS_VERSION = "2026-10-01";

// The versions above are IDs (what consents and the accepting migrations
// record), often chosen ahead of the release: never print them as a date.
// What the pages print ("Last updated") is the day the text really went
// live: the day its PR merged to master (= production), UTC. RULE: the PR
// that bumps a version sets its PUBLISHED date to the day it merges (fix it
// on the day if the merge slips), and so does any condition / flag flip that
// changes what /privacy or /terms shows (ec); a test fails if one is in the
// future (02, 10-13: the banner and the page said 17 October on 9 October).
// SET TO THE MERGE DAY (UTC) when this PR merges.
export const PRIVACY_PUBLISHED = "2026-10-13"; // 2026-10-19 (#533's merge day; re-set it if the merge slips)
export const TERMS_PUBLISHED = "2026-09-30"; // 2026-10-01 went live 09:04 UTC

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
