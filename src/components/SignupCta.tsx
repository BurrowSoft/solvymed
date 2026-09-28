"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { utmQuerySuffix } from "@/lib/attribution";

// "Start your free trial": the professional web signup (signup's default
// role). Campaign links land here with utm_* in the URL; they're forwarded
// so attribution keeps them even if the visitor accepts cookies only after
// a full page load. Added after hydration, so the landing page stays static.
export function SignupCta({ label, className }: { label: string; className: string }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const suffix = utmQuerySuffix(Object.fromEntries(new URLSearchParams(location.search)));
    setQuery(suffix ? `?${suffix.slice(1)}` : "");
  }, []);
  return (
    <Link href={`/auth/signup${query}`} className={className}>
      {label}
    </Link>
  );
}
