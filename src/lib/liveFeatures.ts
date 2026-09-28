// Features the public pages may claim (UX rule: only claim what is live on
// the day it ships). Each flips to true in its own small reviewed PR when
// the feature is live for customers, not when the code is merged.
export const liveFeatures = {
  // PromptPay QR for Thai practices: after migration 110 + a real Thai
  // banking-app scan (TH-4).
  promptPay: false,
  // Appointment reminders on LINE (TH-6).
  lineReminders: false,
  // SolvyAI, the AI assistant (Enhancing UX).
  solvyAi: false,
  // "Built for PDPA": consent at signup + the record access log live
  // (TH-3) and the Thai lawyer's OK on the wording.
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
} as const;

// The languages the app's PDFs are generated in today (UX, verified on the
// app): the "PDFs in your language" claim is only made in these, plus Thai
// once thaiPdfs is live.
export const PDF_LOCALES: readonly string[] = ["pt-BR", "en", "es", "fr", "de", "it"];

export function pdfsInLocale(locale: string): boolean {
  return PDF_LOCALES.includes(locale) || (locale === "th" && liveFeatures.thaiPdfs);
}
