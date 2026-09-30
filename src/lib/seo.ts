import type { Metadata } from "next";
import { publicLocales } from "./publicLocales";

// A public page's own canonical URL and hreflang set (3e: a page without
// its own used to inherit the layout's, i.e. the home page's, so search
// engines could fold privacy, terms or help into the home page). English
// has no locale prefix; the home page keeps its trailing slash.
export const SITE = "https://www.solvymed.com";

// path: "" for the home page, else "/privacy", "/help/a1", …
export function localizedUrl(locale: string, path: string): string {
  return `${SITE}${locale === "en" ? "" : `/${locale}`}${path || "/"}`;
}

// Only the offered languages (Thai while it's public), plus x-default = English.
export function localeAlternates(locale: string, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = Object.fromEntries(publicLocales().map((l) => [l, localizedUrl(l, path)]));
  languages["x-default"] = localizedUrl("en", path);
  return { canonical: localizedUrl(locale, path), languages };
}
