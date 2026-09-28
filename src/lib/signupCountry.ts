import { thaiEnabled } from "./publicLocales";

// The practice-country picker at doctor signup (Sprint TH, TH-1): Brasil,
// ประเทศไทย or Other. It's stored once (professionals.country, migration
// 110) and afterwards changes only through support.

export type CountryChoice = "BR" | "TH" | "OTHER";

// Pre-selection: the visitor's country when it's BR or TH; any other known
// country means Other; unknown falls back to the page language (pt-BR →
// Brasil, th → Thailand), else Brasil. The picker only exists from the
// Thai release on (signupCountryMetadata), so Thailand is always offered.
export function initialCountryChoice(detected: string | null | undefined, locale: string): CountryChoice {
  const c = (detected ?? "").toUpperCase();
  if (c === "BR" || c === "TH") return c;
  if (/^[A-Z]{2}$/.test(c)) return "OTHER";
  if (locale === "th") return "TH";
  return "BR";
}

// What's sent as user_metadata.country: BR, TH, or for Other the detected
// country (when it isn't BR/TH), else 'ZZ' (unknown). UX decision.
export function countryToStore(choice: CountryChoice, detected: string | null | undefined): string {
  if (choice !== "OTHER") return choice;
  const c = (detected ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "BR" && c !== "TH" ? c : "ZZ";
}

// The signup metadata for the practice country. Before the Thai release
// (NEXT_PUBLIC_THAI_ENABLED) there's no picker and nothing is sent, so the
// database default (BR) applies: the picker, Other (USD) and Thailand go
// live together, behind the pricing gate (UX; the app does the same).
export function signupCountryMetadata(
  choice: CountryChoice,
  detected: string | null | undefined,
  timeZone: string | null,
  offered: boolean = thaiEnabled,
): { country?: string; time_zone?: string | null } {
  if (!offered) return {};
  return { country: countryToStore(choice, detected), time_zone: timeZone };
}

// The browser's IANA time zone, sent with the signup; the server keeps it
// only where it fits the country (a Brazilian zone for BR, Asia/Bangkok for
// TH, any valid zone for Other).
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
