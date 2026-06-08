export type Region = "na" | "eu" | "apac" | "mea" | "latam";

const COUNTRY_REGIONS: Record<string, Region> = {
  US: "na", CA: "na", MX: "na",
  GB: "eu", DE: "eu", FR: "eu", IT: "eu", ES: "eu", NL: "eu", PT: "eu",
  PL: "eu", SE: "eu", NO: "eu", DK: "eu", FI: "eu", AT: "eu", CH: "eu",
  BE: "eu", GR: "eu", CZ: "eu", HU: "eu", RO: "eu", TR: "eu", IE: "eu",
  JP: "apac", CN: "apac", KR: "apac", AU: "apac", NZ: "apac",
  SG: "apac", TH: "apac", ID: "apac", MY: "apac", PH: "apac", IN: "apac",
  VN: "apac", HK: "apac", TW: "apac",
  AE: "mea", SA: "mea", EG: "mea", ZA: "mea", NG: "mea", KE: "mea",
  IL: "mea", QA: "mea", KW: "mea", MA: "mea",
  BR: "latam", AR: "latam", CO: "latam", CL: "latam", PE: "latam",
  VE: "latam", EC: "latam", UY: "latam",
};

const COUNTRY_CURRENCIES: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", JP: "JPY",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", PT: "EUR",
  AT: "EUR", BE: "EUR", FI: "EUR", IE: "EUR", GR: "EUR",
  CH: "CHF", CN: "CNY", IN: "INR", BR: "BRL", MX: "MXN",
  KR: "KRW", SG: "SGD", HK: "HKD", AE: "AED", SA: "SAR",
  NZ: "NZD", ZA: "ZAR", TH: "THB", ID: "IDR", MY: "MYR",
  PH: "PHP", VN: "VND", TW: "TWD", TR: "TRY", PL: "PLN",
  SE: "SEK", NO: "NOK", DK: "DKK", CZ: "CZK", HU: "HUF",
  RO: "RON", IL: "ILS", QA: "QAR", KW: "KWD",
  AR: "ARS", CL: "CLP", CO: "COP",
};

export function detectCountry(
  headers: Headers | Record<string, string | null | undefined>
): string {
  const get = (key: string): string | null | undefined =>
    headers instanceof Headers ? headers.get(key) : headers[key];
  // x-burrowsoft-geo is set by middleware for dev mode (?dev=1&country=xx)
  // Vercel re-injects x-vercel-ip-country at the edge, so we check our custom header first
  return get("x-burrowsoft-geo") ?? get("x-vercel-ip-country") ?? get("cf-ipcountry") ?? "US";
}

export function getRegion(countryCode: string): Region {
  return COUNTRY_REGIONS[countryCode] ?? "na";
}

export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCIES[countryCode] ?? "USD";
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "the United States", CA: "Canada", MX: "Mexico",
  GB: "the United Kingdom", DE: "Germany", FR: "France", IT: "Italy",
  ES: "Spain", NL: "the Netherlands", PT: "Portugal", PL: "Poland",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  AT: "Austria", CH: "Switzerland", BE: "Belgium", GR: "Greece",
  CZ: "the Czech Republic", HU: "Hungary", RO: "Romania", TR: "Turkey",
  IE: "Ireland", UA: "Ukraine", SK: "Slovakia", HR: "Croatia",
  JP: "Japan", CN: "China", KR: "South Korea", AU: "Australia",
  NZ: "New Zealand", SG: "Singapore", TH: "Thailand", ID: "Indonesia",
  MY: "Malaysia", PH: "the Philippines", IN: "India", VN: "Vietnam",
  HK: "Hong Kong", TW: "Taiwan", BD: "Bangladesh", PK: "Pakistan",
  LK: "Sri Lanka", MM: "Myanmar", KH: "Cambodia",
  AE: "the UAE", SA: "Saudi Arabia", EG: "Egypt", ZA: "South Africa",
  NG: "Nigeria", KE: "Kenya", MA: "Morocco", IL: "Israel",
  QA: "Qatar", KW: "Kuwait", BH: "Bahrain", JO: "Jordan", IQ: "Iraq",
  BR: "Brazil", AR: "Argentina", CO: "Colombia", CL: "Chile",
  PE: "Peru", VE: "Venezuela", EC: "Ecuador", UY: "Uruguay",
  RU: "Russia",
};

export function getCountryName(countryCode: string): string {
  return COUNTRY_NAMES[countryCode] ?? "Your Region";
}

export function getLanguageForCountry(countryCode: string): string {
  const languages: Record<string, string> = {
    US: "en", GB: "en", AU: "en", CA: "en", NZ: "en", IE: "en",
    DE: "de", AT: "de", CH: "de",
    FR: "fr", BE: "fr",
    ES: "es", MX: "es", AR: "es", CO: "es", CL: "es",
    IT: "it", PT: "pt", BR: "pt",
    JP: "ja", CN: "zh", KR: "ko", TH: "th", VN: "vi",
    IN: "hi", ID: "id", MY: "ms",
    TR: "tr", PL: "pl", SE: "sv", NO: "no", DK: "da",
    FI: "fi", NL: "nl", GR: "el", HU: "hu", RO: "ro",
    CZ: "cs", IL: "he", AE: "ar", SA: "ar", EG: "ar",
  };
  return languages[countryCode] ?? "en";
}
