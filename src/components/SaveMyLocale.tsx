"use client";

import { useEffect } from "react";
import { saveMyLocale } from "@/app/[locale]/(site)/dashboard/locale-actions";

// Keeps the signed-in user's saved language (117) in step with the site's:
// once per language per browser (it's rendered on every dashboard page, so
// it covers sign-in and every language change). A failed save (before 117)
// is tried again at most once per tab session.
const SAVED_KEY = "solvymed_saved_locale";
const TRIED_KEY = "solvymed_saved_locale_tried";

export function SaveMyLocale({ locale }: { locale: string }) {
  useEffect(() => {
    try {
      if (localStorage.getItem(SAVED_KEY) === locale || sessionStorage.getItem(TRIED_KEY) === locale) return;
      sessionStorage.setItem(TRIED_KEY, locale);
    } catch {
      // No storage: still save once per page load.
    }
    void saveMyLocale(locale).then((ok) => {
      if (!ok) return;
      try { localStorage.setItem(SAVED_KEY, locale); } catch { /* none */ }
    }).catch(() => {});
  }, [locale]);
  return null;
}
