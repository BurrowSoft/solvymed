import { thaiEnabled } from "./publicLocales";

// The practice country at doctor signup (Sprint TH; country first, Vitor
// 2026-10-01): Brasil or ประเทศไทย, chosen on the signup's first step.
// "Other" is no longer offered; practices already stored with another
// country keep the registry's explicit default (lib/country). It's stored
// once (professionals.country, migration 110) and afterwards changes only
// through support.

export type CountryChoice = "BR" | "TH";

// The country step's choice, read back from ?c= (anything else = none). Not
// ?country=: the middleware reads that as a dev geo override. ?c= is also
// the hint the share links carry (invite / join / secretary, 38).
export function parseCountryChoice(raw: string | null | undefined): CountryChoice | null {
  const c = (raw ?? "").toUpperCase();
  return c === "BR" || c === "TH" ? c : null;
}

// The country step's buttons: the flag, the name in its own language, and
// the language the signup continues in (unless "Use SolvyMed in English").
export const COUNTRY_STEP: readonly { code: CountryChoice; flag: string; label: string; locale: string }[] = [
  { code: "BR", flag: "🇧🇷", label: "Brasil", locale: "pt-BR" },
  { code: "TH", flag: "🇹🇭", label: "ประเทศไทย", locale: "th" },
];

// The signup page in a language, keeping its query, with ?c= set (a
// choice) or removed (back to the step).
export function countryStepHref(country: CountryChoice | null, locale: string, params: { toString(): string }): string {
  const q = new URLSearchParams(params.toString());
  if (country) q.set("c", country);
  else q.delete("c");
  const qs = q.toString();
  return `${locale === "en" ? "" : `/${locale}`}/auth/signup${qs ? `?${qs}` : ""}`;
}

// The signup metadata for the practice country. Before the Thai release
// (NEXT_PUBLIC_THAI_ENABLED) there's no picker and nothing is sent, so the
// database default (BR) applies: the picker and Thailand go
// live together, behind the pricing gate (UX; the app does the same).
export function signupCountryMetadata(
  choice: CountryChoice,
  timeZone: string | null,
  offered: boolean = thaiEnabled,
): { country?: string; time_zone?: string | null } {
  if (!offered) return {};
  return { country: choice, time_zone: timeZone };
}

// The browser's IANA time zone, sent with the signup; the server keeps it
// only where it fits the country (a Brazilian zone for BR, Asia/Bangkok for
// TH).
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
