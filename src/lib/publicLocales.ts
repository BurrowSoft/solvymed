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
// landing section) is open too (Vitor, 2026-10-01: with 1.4.0). The same
// "0" is the off switch for both.
export const thaiEnabled = thaiLanguagePublic;

// Country first (Vitor, 2026-10-01): the site speaks the two countries'
// languages and English. The other 12 message files stay in the repo (a
// future expansion) but aren't offered: their URLs 308 to English, and
// they're out of the switchers, detection and hreflang.
export const OFFERED_LOCALES: readonly string[] = ["en", "pt-BR", "th"];

// A routed language that's no longer offered (not Thai switched off).
export function isRetiredLocale(locale: string): boolean {
  return (routing.locales as readonly string[]).includes(locale) && !OFFERED_LOCALES.includes(locale);
}

export function isPublicLocale(locale: string, enabled = thaiLanguagePublic): boolean {
  return OFFERED_LOCALES.includes(locale) && (locale !== "th" || enabled);
}

export function publicLocales(enabled = thaiLanguagePublic): string[] {
  return (routing.locales as readonly string[]).filter((l) => isPublicLocale(l, enabled));
}
