"use client";

import { useTranslations } from "next-intl";
import { openCookieSettings } from "@/lib/consentClient";

// Reopens the cookie banner with the current choices, to change them.
export function CookieSettingsButton({ className = "" }: { className?: string }) {
  const t = useTranslations("footer");
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {t("cookieSettings")}
    </button>
  );
}
