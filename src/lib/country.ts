// What a practice's COUNTRY decides (Sprint TH, TH-1): currency, the
// patient ID, the phone prefix, the payment QR and the default time zone.
// Never derive these from the UI language. Mirrors the app's
// lib/country.ts: BR and TH have their own rules; any other country (or the
// unknown 'ZZ') is "Other". Stored as ISO-3166 alpha-2 in
// professionals.country (migration 110); 'BR' until then.

export type Currency = "BRL" | "THB" | "USD";

export type CountryProfile = {
  kind: "BR" | "TH" | "OTHER";
  currency: Currency;
  patientId: "cpf" | "thai_id" | "passport";
  phonePrefix: "+55" | "+66" | null;
  paymentQr: "pix" | "promptpay" | null;
  defaultTimeZone: string;
};

const BR: CountryProfile = {
  kind: "BR", currency: "BRL", patientId: "cpf", phonePrefix: "+55", paymentQr: "pix", defaultTimeZone: "America/Sao_Paulo",
};
const TH: CountryProfile = {
  kind: "TH", currency: "THB", patientId: "thai_id", phonePrefix: "+66", paymentQr: "promptpay", defaultTimeZone: "Asia/Bangkok",
};
const OTHER: CountryProfile = {
  kind: "OTHER", currency: "USD", patientId: "passport", phonePrefix: null, paymentQr: null, defaultTimeZone: "UTC",
};

export function normalizeCountry(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "BR";
}

export function countryProfile(country: string | null | undefined): CountryProfile {
  const c = normalizeCountry(country);
  return c === "BR" ? BR : c === "TH" ? TH : OTHER;
}
