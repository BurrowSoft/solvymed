"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { noteLocaleArrival } from "@/lib/localeArrival";

// Notes, on every page, whether the site picked this visit's language
// (?lr=1 on an automatic redirect, lib/localeArrival), so any way into the
// signup (a CTA, the login's "Criar conta", a client navigation) still asks
// for the country (funnel F2, b9). Renders nothing.
export function LocaleArrival() {
  const pathname = usePathname();
  useEffect(() => {
    noteLocaleArrival(location.search);
  }, [pathname]);
  return null;
}
