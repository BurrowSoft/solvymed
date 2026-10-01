import { thaiEnabled } from "./publicLocales";

// The practice-country picker at doctor signup (Sprint TH, TH-1): Brasil or
// ประเทศไทย. "Other" is no longer offered (Vitor 1.4.0); practices already
// stored with another country keep the registry's explicit default
// (lib/country). It's stored once (professionals.country, migration 110)
// and afterwards changes only through support.

export type CountryChoice = "BR" | "TH";

// Pre-selection: the visitor's country when it's BR or TH, else the page
// language (pt-BR → Brasil, th → Thailand), else none: the doctor picks.
export function initialCountryChoice(detected: string | null | undefined, locale: string): CountryChoice | null {
  const c = (detected ?? "").toUpperCase();
  if (c === "BR" || c === "TH") return c;
  if (locale === "th") return "TH";
  if (locale === "pt-BR") return "BR";
  return null;
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
