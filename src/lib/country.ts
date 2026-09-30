// What a practice's COUNTRY decides (Sprint TH, TH-1): currency, the
// patient ID, the phone prefix, the payment QR and the default time zone.
// Never derive these from the UI language. Mirrors the app's
// lib/country.ts: BR and TH have their own rules; any other country (or the
// unknown 'ZZ') is "Other". Stored as ISO-3166 alpha-2 in
// professionals.country (migration 110); 'BR' until then.

// "NONE": practices outside the countries we support by name price in their
// own currency, which we don't know, so their prices show as plain numbers
// ("1,500.50"), never with a guessed "$" (UX, 1 Oct). The SolvyMed plan is
// priced separately (lib/subscription getPlanPrice: US$ 19).
export type Currency = "BRL" | "THB" | "USD" | "NONE";

// The settings message keys a country's form examples use (Settings →
// Profile / Clinic). Adding a country = adding its keys to the messages.
type SettingsKey =
  | "registrationPlaceholder" | "registrationPlaceholderTH" | "registrationPlaceholderOther"
  | "clinicNamePlaceholder" | "clinicNamePlaceholderTH" | "clinicNamePlaceholderOther"
  | "addressPlaceholder" | "addressPlaceholderTH" | "addressPlaceholderOther"
  | "state" | "stateProvince" | "stateOrProvince";

export type CountryProfile = {
  kind: "BR" | "TH" | "OTHER";
  currency: Currency;
  patientId: "cpf" | "thai_id" | "passport";
  phonePrefix: "+55" | "+66" | null;
  paymentQr: "pix" | "promptpay" | null;
  defaultTimeZone: string;
  // The clinic's tax ID field in Settings → Clinic, if the country has one.
  clinicTaxId: "cnpj" | "th_tax_id" | null;
  // Examples and labels in the practice's forms (UX: they follow the
  // practice country, never the UI language). null = the generic wording.
  examples: {
    titles: { th?: string; other: string } | null; // name titles; null = the locale's own list
    registration: SettingsKey;
    clinicName: SettingsKey;
    address: SettingsKey;
    stateLabel: SettingsKey;
    state: string | null;                 // e.g. "SP"
    city: string | null;
    phone: string | null;                 // null = "+ country code and number"
    website: string;
  };
};

const BR: CountryProfile = {
  kind: "BR", currency: "BRL", patientId: "cpf", phonePrefix: "+55", paymentQr: "pix", defaultTimeZone: "America/Sao_Paulo",
  clinicTaxId: "cnpj",
  examples: {
    titles: { other: "Dr., Dra., Prof." },
    registration: "registrationPlaceholder", clinicName: "clinicNamePlaceholder", address: "addressPlaceholder",
    stateLabel: "state", state: "SP", city: "São Paulo", phone: "(11) 3000-0000", website: "www.example.com.br",
  },
};
const TH: CountryProfile = {
  kind: "TH", currency: "THB", patientId: "thai_id", phonePrefix: "+66", paymentQr: "promptpay", defaultTimeZone: "Asia/Bangkok",
  clinicTaxId: "th_tax_id",
  examples: {
    titles: { th: "นพ., พญ., ทพ., ทญ.", other: "Dr." },
    registration: "registrationPlaceholderTH", clinicName: "clinicNamePlaceholderTH", address: "addressPlaceholderTH",
    stateLabel: "stateProvince", state: null, city: "Bangkok", phone: "02 000 0000", website: "www.example.com",
  },
};
// The explicit default: any country without its own entry (or the unknown 'ZZ').
const OTHER: CountryProfile = {
  kind: "OTHER", currency: "NONE", patientId: "passport", phonePrefix: null, paymentQr: null, defaultTimeZone: "UTC",
  clinicTaxId: null,
  examples: {
    titles: null,
    registration: "registrationPlaceholderOther", clinicName: "clinicNamePlaceholderOther", address: "addressPlaceholderOther",
    stateLabel: "stateOrProvince", state: null, city: null, phone: null, website: "www.example.com",
  },
};

// One entry per country with its own rules (UX: never if/else on the
// country; adding a country = adding one entry here, and in the app's
// lib/country.ts with the same keys).
const PROFILES: Readonly<Record<string, CountryProfile>> = { BR, TH };

export function normalizeCountry(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "BR";
}

// The name-title examples for a practice country, in the UI language when
// the country has them there; null = use the locale's own list.
export function titleExamples(country: string | null | undefined, locale: string): string | null {
  const titles = countryProfile(country).examples.titles;
  return titles ? (titles as Record<string, string | undefined>)[locale] ?? titles.other : null;
}

export function countryProfile(country: string | null | undefined): CountryProfile {
  return PROFILES[normalizeCountry(country)] ?? OTHER;
}
