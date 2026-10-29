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
// 2026-10-21 (DRAFT; the Studio launch): §6f My brand AND Document Studio:
// the document design is stored; posters, social images and letterheads are
// made on the device, never stored, without patient data or a signature; the
// booking QR holds the public invite link; the design is deleted with the
// account. Left out until live: the uploaded signature image
// (studio-signature-live) and the reversed logo (no upload yet). Mobile's
// accepting migration for ('privacy','2026-10-21') applied FIRST; merged with
// the document_studio flag flip (document-studio-live).
// 2026-10-22 (DRAFT until Vitor's OK): §3.1 Sign in with Google: Google tells
// us the name and e-mail (verified); a profile photo link may come too and
// stays in the sign-in record, never shown or used (01's wording); a
// password only for e-mail sign-ups. No §5 row (the user's own choice;
// Google acts as its own controller). Mobile's accepting migration 233
// (#532) applied FIRST; the app's PRIVACY_VERSION twin follows (3e).
// 2026-10-23: §6h Demo mode + its §9 line (demo-mode-live; Vitor's "OK
// privacy demo", via 01, 10-22): the anonymous temporary session, fictional
// data, no real patient data, no side effects (234's guards + #597), SolvyAI
// for 5 messages with no text kept (an anonymous count only), the salted
// IP hash, deletion within 24 h or at once on leaving / signing up, nothing
// copied into a real account; statistics only with consent. Cloudflare
// (Turnstile) checks that a person starts the demo: its own §5 row + a §6h
// line (Vitor's "OK privacy Cloudflare"); the dormant sign-up row is
// untouched. Mobile's 234 (accepting 2026-10-23) applied FIRST; merged
// with the demo_mode flip; the app's PRIVACY_VERSION twin follows (0e).
// 2026-10-27: §6h, the demo's cookie-free counters (Vitor's "OK privacy counting v2",
// via 01, 10-26): daily totals per country and language of the demos opened and the
// steps used, with no account, IP address or device identifier; a per-demo note (238's
// demo_sandboxes.metrics_seen / demo_signin_marks) so each demo counts once, deleted with
// the demo. Mobile's 238 (accepting 2026-10-27) applied FIRST; merged with (or right
// before) #615, the web counters; then 01 flips server_flags.demo_metrics.
// 2026-10-28 (NOT YET: the text is in, each part hidden behind its own condition; Vitor's
// OKs, 10-27, specs/privacy-approved-lines-2026-10-27.md + specs/patient-channel-privacy-draft.md):
// §6i Patient Channel with its §6g / §7 / §9 lines (patient-channel-live; PC-9 pc-cover-live,
// PC-10 pc-ai-live; PC-N1/N2 wait for their 247 rewrite), the one-time reminders in §4 / §5 / §6g
// (reminders-live), §3.6's Android install campaign (app-referrer-live), §6h's "or in the
// Android app" (app-demo-live) and the automatic WhatsApp rows (whatsapp-auto-live). Vitor's
// "OK to all privacies" (01, 10-27), en + pt-BR: PC-8′ and PC-10′ replace PC-8 / PC-10, PC-10b (§5
// Anthropic) and PC-10c (§6b) with pc-ai-live, PC-N1′/N2′ (§6g) and PC-N3 (the LINE / Z-API / Resend
// rows) with pc-notify-live, PC-W1 (§6e) with whatsapp-optout-live, and cf's §3.6 / §6g rewordings. The FIRST
// of those flips bumps this to "2026-10-28" (and PRIVACY_PUBLISHED to its merge day), only
// after the mobile privacy-accept migration (accepting ('privacy','2026-10-28')) is live; a test enforces the pairing.
// The first flip is automatic WhatsApp (whatsapp-auto-live + whatsapp-optout-live: §5's Z-API and
// WhatsApp (Meta) rows, §6e's line with PC-W1′, PC-N3's Z-API clause once pc-notify-live), merged
// right after retention A (§9's 20 years per country; Vitor's "OK retention lines").
// ONE bump (01, 10-28): the Patient Channel (patient-channel-live: §6i, §7, §9; pc-notify-live:
// PC-N1′/N2′ in §6g, PC-N3 in the rows) flips in the same release step, so users re-accept once.
// 2026-10-29 (an id; LINE for Thailand, Vitor 10-28, via 01): line-live reveals §5's LY Corporation
// (LINE) row, §6's "and LINE notices by LY Corporation" and §6c, whose second bullet now names
// the Patient Channel notice (01's drafts, with pc_notice_line on in the same window), and §PC's
// "resolved without a message" line now says which FAQ answer or automatic message helped (item 43;
// cf: the old line didn't cover a per-item count; Vitor's "OK resolved privacy", 10-29). Mobile's
// accepting migration for ('privacy','2026-10-29') applied FIRST; the app's PRIVACY_VERSION twin
// and its OTA on both runtimes follow (the standing rule).
export const PRIVACY_VERSION = "2026-10-29";
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
export const PRIVACY_PUBLISHED = "2026-10-29"; // the line-live PR's merge day (UTC; fix it on the day if the merge slips): LINE + item 43's per-item count
export const TERMS_PUBLISHED = "2026-09-30"; // 2026-10-01 went live 09:04 UTC

// Sent with every web signup (the checkbox is required, so it's sent only
// on acceptance).
export function consentMetadata() {
  return { privacy_version: PRIVACY_VERSION, terms_version: TERMS_VERSION, privacy_consent_platform: "web" as const };
}

// "September 28, 2026" / "28 de setembro de 2026" (the legal pages are in
// English or Brazilian Portuguese).
export function legalDateLabel(lang: "en" | "pt-BR" | "th", version: string): string {
  const [y, m, d] = version.split("-").map(Number);
  // Thai: the Buddhist-era year, as Thai documents write it (e.g. 26 ตุลาคม 2569).
  return new Intl.DateTimeFormat(lang === "pt-BR" ? "pt-BR" : lang === "th" ? "th-TH" : "en-GB", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
