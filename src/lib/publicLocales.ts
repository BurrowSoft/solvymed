import { routing } from "@/i18n/routing";

// Thai ships with the Thai release (Sprint TH, TH-2). Until
// NEXT_PUBLIC_THAI_ENABLED is "1" it's never offered: not in the language
// switchers, not picked by first-visit detection, not in the hreflang
// alternates, and /th/... redirects (307, middleware) to the same page
// without the prefix. The flag is set on Vercel Preview only, so the
// native reviewer and testers see Thai there; Production gets it with the
// Thai release (UX's go).
export const thaiEnabled = process.env.NEXT_PUBLIC_THAI_ENABLED?.trim() === "1";

export function isPublicLocale(locale: string, enabled = thaiEnabled): boolean {
  return locale !== "th" || enabled;
}

export function publicLocales(enabled = thaiEnabled): string[] {
  return (routing.locales as readonly string[]).filter((l) => isPublicLocale(l, enabled));
}
