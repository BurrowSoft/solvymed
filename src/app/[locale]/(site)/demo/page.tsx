"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { publicFlag } from "@/lib/publicFlags";
import { demoCountry, demoTestOn, isDemoUser } from "@/lib/demo";
import { track } from "@/lib/track";

// /demo: the ads' landing (specs/demo-mode.md). Straight into the demo
// clinic: no form, no country step (the path's country, as F2). An anonymous
// session, then start_demo (234, idempotent: a second visit reuses the
// sandbox), then the dashboard, where the DEMO bar takes over. While the
// switch demo_mode is off (and without ?demo_test=1): a short card to the
// sign-up. A real account that's already signed in is never touched.
type State = "loading" | "unavailable" | "signedIn" | "error";

export default function DemoPage() {
  const t = useTranslations("demo");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const prefix = locale === "en" ? "" : `/${locale}`;
  const country = demoCountry(locale);
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    void (async () => {
      try {
        const on = demoTestOn(location.search) || (await publicFlag(supabase, "demo_mode"));
        if (!live) return;
        if (!on) {
          setState("unavailable");
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!live) return;
        if (user && !isDemoUser(user)) {
          setState("signedIn");
          return;
        }
        if (!user) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }
        const { error: startError } = await supabase.rpc("start_demo", { p_country: country, p_locale: locale });
        if (startError) throw startError;
        track("demo_start", { platform: "web", c: country });
        window.location.replace(`${prefix}/dashboard`);
      } catch {
        if (live) setState("error");
      }
    })();
    return () => { live = false; };
  }, [attempt, country, locale, prefix]);

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />
        {state === "loading" && (
          <div data-testid="demo-loading" role="status" className="flex flex-col items-center gap-4 py-6">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#F59E0B] border-t-transparent" aria-hidden="true" />
            <p className="text-base font-semibold text-slate-800">{t("loading")}</p>
          </div>
        )}
        {state === "unavailable" && (
          <div data-testid="demo-unavailable" className="flex flex-col items-center gap-3 py-2 text-center">
            <h1 className="text-lg font-bold text-slate-900">{t("unavailableTitle")}</h1>
            <p className="text-sm text-slate-600">{t("unavailableBody")}</p>
            <a href={`${prefix}/auth/signup?c=${country}`} className="mt-2 rounded-full bg-[#0D9488] px-5 py-2.5 text-sm font-bold text-white">{t("signup")}</a>
          </div>
        )}
        {state === "signedIn" && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <h1 className="text-lg font-bold text-slate-900">{t("signedInTitle")}</h1>
            <Link href={`${prefix}/dashboard`} className="mt-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white">{t("openDashboard")}</Link>
          </div>
        )}
        {state === "error" && (
          <div data-testid="demo-error" role="alert" className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-slate-700">{t("error")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{t("retry")}</button>
              <a href={`${prefix}/auth/signup?c=${country}`} className="rounded-full bg-[#0D9488] px-4 py-2 text-sm font-bold text-white">{t("signup")}</a>
            </div>
          </div>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
