"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { publicFlag } from "@/lib/publicFlags";
import { DEMO_TEST_PARAM, demoTestOn } from "@/lib/demo";
import { utmQuerySuffix } from "@/lib/attribution";

// "Ver demonstração" next to the landing's sign-up CTA (specs/demo-mode.md):
// only while the switch demo_mode is on (or ?demo_test=1, the tester's
// window, carried on to /demo). The visit's utm go along, like SignupCta's.
// testAllowed: from the server (VERCEL_ENV !== "production"), never on www.
export function DemoCta({ className, testAllowed }: { className: string; testAllowed: boolean }) {
  const t = useTranslations("demo");
  const [on, setOn] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    const test = demoTestOn(location.search, testAllowed);
    const utm = utmQuerySuffix(Object.fromEntries(new URLSearchParams(location.search))).slice(1);
    setQuery([utm, test ? `${DEMO_TEST_PARAM}=1` : ""].filter(Boolean).join("&"));
    if (test) {
      setOn(true);
      return;
    }
    void publicFlag(createClient(), "demo_mode").then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, [testAllowed]);

  if (!on) return null;
  return (
    <Link href={`/demo${query ? `?${query}` : ""}`} data-testid="landing-demo-cta" className={className}>
      {t("landingCta")}
    </Link>
  );
}
