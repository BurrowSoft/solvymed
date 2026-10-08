"use client";

import { useEffect } from "react";
import { routing } from "@/i18n/routing";

const LOCALE_RE = new RegExp(`^/(${routing.locales.join("|")})(/|$)`);

// The same address in another language: /th/dashboard/x?y → /pt-BR/dashboard/x?y
// (English has no prefix).
export function localizedPath(to: string, pathname: string, rest = ""): string {
  const bare = pathname.replace(LOCALE_RE, "/");
  return (to === "en" ? bare : `/${to}${bare === "/" ? "" : bare}`) + rest;
}

// A language the practice country doesn't offer (e.g. Thai in a Brazilian
// practice; Vitor 2026-10-01): the dashboard layout renders this instead of
// the dashboard, so nothing is shown or usable in that language (b3: a
// SolvyAI answer was lost when the old after-load switch landed). A full
// replace: the address bar and NEXT_LOCALE change before anything renders.
export function LocaleRedirect({ to }: { to: string }) {
  useEffect(() => {
    document.cookie = `NEXT_LOCALE=${to}; path=/; max-age=31536000; samesite=lax`;
    const { pathname, search, hash } = window.location;
    window.location.replace(localizedPath(to, pathname, search + hash));
  }, [to]);
  return null;
}
