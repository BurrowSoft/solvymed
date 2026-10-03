// Features the public pages may claim (UX rule: only claim what is live on
// the day it ships). Each flips to true in its own small reviewed PR when
// the feature is live for customers, not when the code is merged.
// Vercel sets NEXT_PUBLIC_VERCEL_ENV itself (production / preview /
// development); read the same on the server and in the browser.
export const foundersPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const liveFeatures = {
  // PromptPay QR for Thai practices: after migration 110 + a real Thai
  // banking-app scan (TH-4). Live: Vitor's Thai bank app paid a SolvyMed
  // PromptPay QR from www (฿10.00, 1 Oct).
  promptPay: true,
  // Appointment reminders on LINE (TH-6).
  lineReminders: false,
  // SolvyAI, the AI assistant (Enhancing UX): its panel for doctors, the
  // tour step, the Novidades item and the pricing line.
  // NEXT_PUBLIC_SOLVYAI_ENABLED=1 turns it all on for testing (a local build
  // or a Preview; the backend is a mock until the edge function exists);
  // nobody sets it on Production until the release.
  solvyAi: process.env.NEXT_PUBLIC_SOLVYAI_ENABLED === "1",
  // "Built for PDPA": consent at signup + the record access log live
  // (TH-3) and Vitor's go (lawyer reviews are post-launch, 2026-10-01).
  pdpa: false,
  // The "Novidades" popup + new-feature tour (walkthrough §4a): on with the
  // release that announces something (and migration 113 for its state).
  // NEXT_PUBLIC_NEWS_ENABLED=1 turns it on for testing (a local build or a
  // Preview); nobody sets it on Production until the release.
  news: process.env.NEXT_PUBLIC_NEWS_ENABLED === "1",
  // The public Help Center (/help): indexed and linked only once the
  // mobile tester has checked every label against the release (UX).
  helpCenter: false,
  // The iPhone app on the App Store (TestFlight only until then).
  iosApp: false,
  // The app's PDFs (prescriptions, receipts, history) in Thai, with
  // Buddhist-year dates (the app's TH-2).
  thaiPdfs: false,
  // The Founders Program page (/founders), its application form and its
  // rules page: LIVE (Vitor, 2 Oct: "you can just turn that page on", the
  // rules page with it; e7). Needs migration 129, the founders@ mailbox,
  // RESEND_API_KEY on Production and privacy §6d (PRIVACY_VERSION
  // 2026-10-03). Uploads stay behind founders-upload-live.
  founders: true,
  foundersRules: true,
  // 1.5.0 "My brand" (Settings → Minha marca; later the branded public
  // pages, emails and prints). On in Previews only (all SSO-protected) for
  // testing against migration 161; flips to true when 1.5.0 is released,
  // with the privacy text and its version bump.
  myBrand: foundersPreview,
  // 1.5.0 secretaries serving several doctors (migration 163): the doctor
  // switcher and the x-acting-practice header. Previews only until the
  // release; a second practice is also refused server-side until
  // server_flags.multi_practice_secretary is on.
  multiPractice: foundersPreview,
  // 1.5.0 patients with several doctors (migration 164): "Meus médicos" on
  // Minhas consultas, "+ Adicionar médico", Desconectar, the doctor filter.
  // Previews only until the release; adding a second doctor is also refused
  // server-side until server_flags.multi_doctor_patient is on.
  multiDoctor: foundersPreview,
} as const;

// The languages the app's PDFs are generated in today (UX, verified on the
// app): the "PDFs in your language" claim is only made in these, plus Thai
// once thaiPdfs is live.
export const PDF_LOCALES: readonly string[] = ["pt-BR", "en", "es", "fr", "de", "it"];

export function pdfsInLocale(locale: string): boolean {
  return PDF_LOCALES.includes(locale) || (locale === "th" && liveFeatures.thaiPdfs);
}
