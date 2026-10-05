// What a practice's COUNTRY decides (Sprint TH, TH-1): currency, the
// patient ID, the phone prefix, the payment QR and the default time zone.
// Never derive these from the UI language. Mirrors the app's
// lib/country.ts: BR and TH have their own rules; any other country (or the
// unknown 'ZZ') is "Other". Stored as ISO-3166 alpha-2 in
// professionals.country (migration 110); 'BR' until then.
import { liveFeatures } from "./liveFeatures";

// "NONE": practices outside the countries we support by name price in their
// own currency, which we don't know, so their prices show as plain numbers
// ("1,500.50"), never with a guessed "$" (UX, 1 Oct). The SolvyMed plan is
// priced separately (lib/subscription getPlanPrice: US$ 19).
export type Currency = "BRL" | "THB" | "USD" | "NONE";

// The Thai professional titles (doctors, dentists): the examples below and
// the greeting's title detection (lib/doctorName) use this one list.
export const THAI_TITLES = ["นพ.", "พญ.", "ทพ.", "ทญ."] as const;

// The settings message keys a country's form examples use (Settings →
// Profile / Clinic). Adding a country = adding its keys to the messages.
type SettingsKey =
  | "registrationPlaceholder" | "registrationPlaceholderTH" | "registrationPlaceholderOther"
  | "clinicNamePlaceholder" | "clinicNamePlaceholderTH" | "clinicNamePlaceholderOther"
  | "addressPlaceholder" | "addressPlaceholderTH" | "addressPlaceholderOther"
  | "state" | "stateProvince" | "stateOrProvince";

// A patient identifier field (migration 110 columns): its label key in the
// patientIds messages, the example, how it's stored (digits only, or text)
// and its length.
export type IdField = {
  name: "cpf" | "th_national_id" | "passport_number";
  label: "cpf" | "thaiId" | "passport" | "passportOrId";
  placeholder: string;
  store: "text" | "digits";
  maxLength: number;   // what the input accepts
  keep?: number;       // what is stored (text is cut to it)
  numeric?: boolean;
  // How the patient search matches it: the digits typed, in order, with
  // any separators between (3+ digits), or the text (3+ characters).
  search: "digits" | "text";
  // The checksum it must pass before saving (the database checks it too).
  checksum?: "thai";
};

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const MON_FRI = ["mon", "tue", "wed", "thu", "fri"] as const;
// Every country's default today; a country can set its own week or hours.
const DEFAULT_HOURS = { days: MON_FRI, start: "08:00", end: "18:00" };

export type CountryProfile = {
  kind: "BR" | "TH" | "OTHER";
  currency: Currency;
  patientId: "cpf" | "thai_id" | "passport";
  // The identifier fields the patient forms show and write, in order.
  idFields: IdField[];
  phonePrefix: "+55" | "+66" | null;
  paymentQr: "pix" | "promptpay" | null;
  defaultTimeZone: string;
  // The clinic's tax ID field in Settings → Clinic, if the country has one.
  clinicTaxId: "cnpj" | "th_tax_id" | null;
  // The language of a push when the recipient's own isn't known (UX).
  fallbackLocale: "pt-BR" | "th" | "en";
  // The messaging app the practice's patient messages use (item 12, the
  // app's #230): WhatsApp, or LINE in Thailand (none until LINE is live).
  messagingApp: "whatsapp" | "line";
  // The UI languages offered to its users (country first, Vitor 2026-10-01):
  // the country's language, then English. The first is where a user whose
  // language isn't in the pair lands.
  languages: readonly ("pt-BR" | "th" | "en")[];
  // Whether a short month name keeps its trailing "." on screen ("ต.ค."),
  // or drops it ("out"): the chosen-time line, as the app's #242.
  shortMonthKeepsDot: boolean;
  // Where a paid appointment's receipt is issued: the website's simple
  // recibo, or only the app (Thailand: numbered receipts).
  receipts: "web" | "app";
  // Where the payment QR's code can be sent to the patient from the Agenda
  // (G4, the app's "Enviar Pix por WhatsApp"): WhatsApp in Brazil (Pix);
  // none elsewhere (no Thai PromptPay sharing; the default has no QR).
  paymentShare: "whatsapp" | null;
  // The year printed on documents: Gregorian, or the Buddhist era (+543).
  calendar: "gregorian" | "buddhist";
  // The public health card the patient form takes (Brazil's CNS), if any.
  healthCard: "cns" | null;
  // A new practice's working hours until the doctor saves their own (cf):
  // these days, start to end. The app's WorkingHoursModal uses the same.
  defaultHours: { days: readonly WeekdayKey[]; start: string; end: string };
  // The order of a printed/one-line address (lib/patientAddress addressLine).
  addressFormat: "br" | "th" | "intl";
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
    // A mobile number (patients' phones; the app's phoneExample, UX):
    // local, with the country code, and after a separate code picker.
    // null = the neutral text (countryExamples.phone).
    mobile: { local: string; intl: string; national: string } | null;
    website: string;
  };
};

const BR: CountryProfile = {
  kind: "BR", currency: "BRL", patientId: "cpf",
  idFields: [{ name: "cpf", label: "cpf", placeholder: "000.000.000-00", store: "text", maxLength: 20, search: "digits" }],
  phonePrefix: "+55", paymentQr: "pix", defaultTimeZone: "America/Sao_Paulo",
  clinicTaxId: "cnpj", fallbackLocale: "pt-BR", languages: ["pt-BR", "en"], shortMonthKeepsDot: false, messagingApp: "whatsapp", receipts: "web", calendar: "gregorian",
  healthCard: "cns", addressFormat: "br", paymentShare: "whatsapp", defaultHours: DEFAULT_HOURS,
  examples: {
    titles: { other: "Dr., Dra., Prof." },
    registration: "registrationPlaceholder", clinicName: "clinicNamePlaceholder", address: "addressPlaceholder",
    stateLabel: "state", state: "SP", city: "São Paulo", phone: "(11) 3000-0000", website: "www.example.com.br",
    mobile: { local: "(11) 99999-9999", intl: "+55 (11) 99999-9999", national: "11 99999-9999" },
  },
};
const TH: CountryProfile = {
  kind: "TH", currency: "THB", patientId: "thai_id",
  idFields: [
    { name: "th_national_id", label: "thaiId", placeholder: "1-2345-67890-12-3", store: "digits", maxLength: 17, numeric: true, search: "digits", checksum: "thai" },
    { name: "passport_number", label: "passport", placeholder: "", store: "text", maxLength: 30, keep: 30, search: "text" },
  ],
  phonePrefix: "+66", paymentQr: "promptpay", defaultTimeZone: "Asia/Bangkok",
  clinicTaxId: "th_tax_id", fallbackLocale: "th", languages: ["th", "en"], shortMonthKeepsDot: true, messagingApp: "line", receipts: "app", calendar: "buddhist",
  healthCard: null, addressFormat: "th", paymentShare: null, defaultHours: DEFAULT_HOURS,
  examples: {
    titles: { th: THAI_TITLES.join(", "), other: "Dr." },
    registration: "registrationPlaceholderTH", clinicName: "clinicNamePlaceholderTH", address: "addressPlaceholderTH",
    stateLabel: "stateProvince", state: null, city: "Bangkok", phone: "02 000 0000", website: "www.example.com",
    mobile: { local: "081 234 5678", intl: "+66 81 234 5678", national: "81 234 5678" },
  },
};
// The explicit default: any country without its own entry (or the unknown 'ZZ').
const OTHER: CountryProfile = {
  kind: "OTHER", currency: "NONE", patientId: "passport",
  idFields: [{ name: "passport_number", label: "passportOrId", placeholder: "", store: "text", maxLength: 30, keep: 30, search: "text" }],
  phonePrefix: null, paymentQr: null, defaultTimeZone: "UTC",
  clinicTaxId: null, fallbackLocale: "en", languages: ["en"], shortMonthKeepsDot: false, messagingApp: "whatsapp", receipts: "web", calendar: "gregorian",
  healthCard: null, addressFormat: "intl", paymentShare: null, defaultHours: DEFAULT_HOURS,
  examples: {
    titles: null,
    registration: "registrationPlaceholderOther", clinicName: "clinicNamePlaceholderOther", address: "addressPlaceholderOther",
    stateLabel: "stateOrProvince", state: null, city: null, phone: null, website: "www.example.com",
    mobile: null,
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

// The profile whose phone prefix this is (a phone's dial code picker);
// any other code is the explicit default.
export function profileOfPhonePrefix(prefix: string): CountryProfile {
  return Object.values(PROFILES).find((p) => p.phonePrefix === prefix) ?? OTHER;
}

// The profile for a kind already resolved from the country (e.g. a form's
// idKind): "OTHER" is the explicit default, never read as a country code.
export function profileOfKind(kind: CountryProfile["kind"]): CountryProfile {
  return Object.values(PROFILES).find((p) => p.kind === kind) ?? OTHER;
}

// The messaging app a practice's WhatsApp/LINE items use today: its own,
// with LINE only once it's live (TH-6), else none: Thai practices see no
// WhatsApp item (Vitor, item 12; the app's #230).
export function messagingChannel(profile: CountryProfile): "whatsapp" | "line" | null {
  if (profile.messagingApp === "line") return liveFeatures.lineReminders ? "line" : null;
  return profile.messagingApp;
}
