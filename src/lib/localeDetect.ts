// First-visit language choice (UX decision): the browser's language wins
// when we support it, and the visitor's country is only the fallback. So a
// Brazilian abroad or on a VPN still gets Portuguese.

const COUNTRY_LOCALE: Record<string, string> = {
  TH: "th",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  UY: "es", PY: "es", BO: "es", EC: "es", CR: "es", PA: "es", DO: "es",
  GT: "es", HN: "es", SV: "es", NI: "es", CU: "es",
  BR: "pt-BR", PT: "pt-BR",
  FR: "fr", BE: "fr", CH: "fr", LU: "fr", MC: "fr",
  JP: "ja",
  CN: "zh",
  TW: "zh-TW", HK: "zh-TW", MO: "zh-TW",
  SA: "ar", AE: "ar", EG: "ar", KW: "ar", QA: "ar",
  BH: "ar", OM: "ar", JO: "ar", LB: "ar", MA: "ar",
  DZ: "ar", TN: "ar", LY: "ar", IQ: "ar", SY: "ar", YE: "ar",
  DE: "de", AT: "de",
  ID: "id",
  KR: "ko",
  IT: "it",
  VN: "vi",
  RU: "ru", UA: "ru", KZ: "ru", BY: "ru",
};

// One browser language tag (e.g. "pt-PT", "zh-Hant-TW", "EN") → a supported
// locale, or null.
export function matchLocaleTag(tag: string, supported: readonly string[]): string | null {
  const t = tag.trim().toLowerCase();
  if (!t || t === "*") return null;
  const exact = supported.find((l) => l.toLowerCase() === t);
  if (exact) return exact;
  const [base, ...rest] = t.split("-");
  if (base === "pt") return supported.includes("pt-BR") ? "pt-BR" : null;
  if (base === "zh") {
    // Traditional script or Taiwan/Hong Kong/Macau → zh-TW; otherwise zh.
    const traditional = rest.some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo");
    const target = traditional ? "zh-TW" : "zh";
    return supported.includes(target) ? target : null;
  }
  return supported.find((l) => l.toLowerCase() === base) ?? null;
}

// The best supported locale in an Accept-Language header, by q-value
// (ties keep header order), or null.
export function localeFromAcceptLanguage(header: string | null | undefined, supported: readonly string[]): string | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((x) => x.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = matchLocaleTag(tag, supported);
    if (locale) return locale;
  }
  return null;
}

// Browser language first; the country only as a fallback; else the default.
export function pickLocale(opts: {
  acceptLanguage: string | null | undefined;
  country: string | null | undefined;
  supported: readonly string[];
  defaultLocale: string;
}): string {
  const fromBrowser = localeFromAcceptLanguage(opts.acceptLanguage, opts.supported);
  if (fromBrowser) return fromBrowser;
  const fromCountry = opts.country ? COUNTRY_LOCALE[opts.country.toUpperCase()] : undefined;
  if (fromCountry && opts.supported.includes(fromCountry)) return fromCountry;
  return opts.defaultLocale;
}

// Path aliases for locales people type or link by hand: /pt → /pt-BR,
// case-insensitive (/pt-br, /zh-tw). Returns the path with the canonical
// prefix, or null when the first segment isn't an alias.
export function canonicalLocalePath(pathname: string, supported: readonly string[]): string | null {
  const [, first = "", ...rest] = pathname.split("/");
  if (!first || supported.includes(first)) return null;
  const lower = first.toLowerCase();
  const target = lower === "pt" ? "pt-BR" : supported.find((l) => l.toLowerCase() === lower);
  if (!target || !supported.includes(target)) return null;
  return `/${[target, ...rest].join("/")}`;
}
