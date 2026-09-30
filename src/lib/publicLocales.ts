import { routing } from "@/i18n/routing";

// Two separate things, one variable (NEXT_PUBLIC_THAI_ENABLED):
//
// The Thai LANGUAGE is public (Vitor, 2026-10-01: it stays on www; the
// wording is adjusted afterwards). Only "0" turns it off: then it's never
// offered: not in the language switchers, not picked by first-visit
// detection, not in the hreflang alternates, and /th/... redirects (307,
// middleware) to the same page without the prefix.
export const thaiLanguagePublic = process.env.NEXT_PUBLIC_THAI_ENABLED?.trim() !== "0";

// The Thai MARKET (Sprint TH: the signup's practice-country picker, the
// pricing page's country switch with Thailand / Other prices, the Thai
// landing section) still ships with the Thai release: only when the
// variable is "1" (set on Vercel Preview for the reviewers and testers;
// Production gets it with UX's go).
export const thaiEnabled = process.env.NEXT_PUBLIC_THAI_ENABLED?.trim() === "1";

export function isPublicLocale(locale: string, enabled = thaiLanguagePublic): boolean {
  return locale !== "th" || enabled;
}

export function publicLocales(enabled = thaiLanguagePublic): string[] {
  return (routing.locales as readonly string[]).filter((l) => isPublicLocale(l, enabled));
}
