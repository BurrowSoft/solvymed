import { isPublicLocale, thaiEnabled } from "./publicLocales";
import { countryProfile } from "./country";

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

// The country hint on a link shared with someone else (invite / join /
// secretary; the app's #233 does the same): ?c=BR or ?c=TH for the
// practice's country, nothing for the default. The app and the signup skip
// the country step with it. Only a hint: staff follow the practice anyway.
export function withCountryHint(url: string, country: string | null | undefined): string {
  const c = parseCountryChoice(country);
  if (!c) return url;
  return `${url}${url.includes("?") ? "&" : "?"}c=${c}`;
}

// The country a patient tapped on the signup's first step, until it's saved
// with their language (149). A cookie, not browser storage, so the first
// /my-appointments (server) already follows it: a Thai pick at a Brazilian
// clinic isn't moved to Portuguese before it's saved (3e, #286).
export const SIGNUP_COUNTRY_COOKIE = "solvymed_signup_country";

export function signupCountryCookie(country: CountryChoice): string {
  return `${SIGNUP_COUNTRY_COOKIE}=${country}; path=/; max-age=${60 * 60 * 24 * 14}; samesite=lax`;
}

// Where a patient's page in `locale` moves to for their country (BR/TH): the
// country's language when the page's isn't in its pair, else null (stay).
// Never to a language that isn't public (Thai switched off), never without a
// country (9a: a failed lookup changes nothing).
export function patientLanguageTarget(locale: string, country: string | null | undefined): string | null {
  const c = parseCountryChoice(country);
  if (!c) return null;
  const pair = countryProfile(c).languages as readonly string[];
  return pair.includes(locale) || !isPublicLocale(pair[0]) ? null : pair[0];
}

// The pick is for the account just created in this browser: honoured only
// while the account is younger than the cookie (a shared computer's next
// patient never inherits it; signing in from the login page clears it too).
export const SIGNUP_PICK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export function pickApplies(accountCreatedAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = accountCreatedAt ? new Date(accountCreatedAt).getTime() : NaN;
  return Number.isFinite(t) && now - t <= SIGNUP_PICK_MAX_AGE_MS;
}
