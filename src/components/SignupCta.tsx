"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { utmQuerySuffix } from "@/lib/attribution";
import { noteLocaleArrival } from "@/lib/localeArrival";
import { LOCALE_REDIRECT_PARAM } from "@/lib/signupCountry";

// "Start your free trial": the professional web signup (signup's default
// role). Campaign links land here with utm_* in the URL; they're forwarded
// so attribution keeps them even if the visitor accepts cookies only after
// a full page load. Added after hydration, so the landing page stays static.
export function SignupCta({ label, className }: { label: string; className: string }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const suffix = utmQuerySuffix(Object.fromEntries(new URLSearchParams(location.search)));
    // A language the site picked (?lr=1, lib/localeArrival) goes along, so
    // the signup asks for the country instead of taking it from the path.
    const params = [suffix.slice(1), noteLocaleArrival(location.search) ? `${LOCALE_REDIRECT_PARAM}=1` : ""].filter(Boolean);
    setQuery(params.length ? `?${params.join("&")}` : "");
  }, []);
  return (
    <Link href={`/auth/signup${query}`} className={className}>
      {label}
    </Link>
  );
}
