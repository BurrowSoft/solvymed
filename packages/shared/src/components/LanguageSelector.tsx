"use client";

import { useLocale } from "next-intl";

/** Language name written in the language itself. Add new locales here as needed. */
export const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  th: "ภาษาไทย",
  pt: "Português",
  "pt-BR": "Português (Brasil)",
  zh: "中文",
  "zh-TW": "繁體中文",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  ru: "Русский",
  ar: "العربية",
  vi: "Tiếng Việt",
  hi: "हिन्दी",
};

interface Props {
  /** The locales this app supports, e.g. ["en", "th"] */
  locales: string[];
  /** Optional Tailwind classes to override styling */
  className?: string;
}

/**
 * Dropdown language selector. Sets the NEXT_LOCALE cookie and triggers a
 * server re-render. Import from @burrowsoft/shared and place in every app's header.
 *
 * Usage:
 *   import { LanguageSelector } from "@burrowsoft/shared";
 *   <LanguageSelector locales={["en", "th"]} />
 */
export function LanguageSelector({ locales, className = "" }: Props) {
  const currentLocale = useLocale();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    document.cookie = `NEXT_LOCALE=${newLocale};max-age=31536000;path=/;SameSite=Lax`;

    // Strip any locale prefix from the current path so the middleware can
    // apply the new locale via redirect (router.refresh() doesn't follow redirects).
    const path = window.location.pathname;
    let bare = path;
    for (const locale of locales) {
      if (path === `/${locale}` || path.startsWith(`/${locale}/`)) {
        bare = path.slice(`/${locale}`.length) || "/";
        break;
      }
    }
    window.location.href = bare;
  }

  return (
    <select
      value={currentLocale}
      onChange={handleChange}
      aria-label="Select language"
      className={`rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm cursor-pointer transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1 ${className}`}
    >
      {locales.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_NAMES[locale] ?? locale}
        </option>
      ))}
    </select>
  );
}
