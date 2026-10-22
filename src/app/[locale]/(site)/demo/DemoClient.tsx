"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { publicFlag } from "@/lib/publicFlags";
import { demoCountry, demoTestOn, isDemoUser, leaveDemo } from "@/lib/demo";
import { track } from "@/lib/track";
import { DemoTurnstile } from "@/components/DemoTurnstile";

// /demo: the ads' landing (specs/demo-mode.md). Straight into the demo
// clinic: no form, no country step (the path's country, as F2). An anonymous
// session, then start_demo (234, idempotent: a second visit reuses the
// sandbox), then the dashboard, where the DEMO bar takes over. While the
// switch demo_mode is off (and without ?demo_test=1): a short card to the
// sign-up. A real account that's already signed in is never touched.
type State = "loading" | "unavailable" | "signedIn" | "busy" | "error";

// testAllowed: ?demo_test=1 counts only off Production (page.tsx, the server).
// siteKey: the demo's Turnstile key (lib/demoTurnstile, from the server).
export function DemoClient({ testAllowed, siteKey }: { testAllowed: boolean; siteKey: string }) {
  const t = useTranslations("demo");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const prefix = locale === "en" ? "" : `/${locale}`;
  const country = demoCountry(locale);
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);
  // The bot check (01 + 0e): shown on the loading screen only while a token
  // is awaited; the flow waits on this promise.
  const [challenge, setChallenge] = useState(0);
  const pending = useRef<{ resolve: (token: string) => void; reject: (e: Error) => void } | null>(null);

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    // A refused or failed start leaves no orphan (01, 10-22): end_demo (it
    // deletes any anonymous caller, sandbox or not; 0e) then sign-out,
    // best-effort. 234's refusals mean no sandbox exists (an existing one
    // answers "ready" first), so they always clean up; any other failure
    // only cleans up the anonymous session made here, so a reload's
    // network blip never ends a running demo. A real account (not_anonymous;
    // never reached, it's sent to its dashboard above) is never signed out.
    let fresh = false;
    let cleaned = false;
    const cleanUp = async (refused: boolean) => {
      if (cleaned || !(refused || fresh)) return;
      cleaned = true;
      await leaveDemo(supabase);
    };
    const refusal = (e: { message?: string } | null) =>
      ["demo_off", "demo_busy", "unsupported_country", "demo_unverified"].find((c) => (e?.message ?? "").includes(c)) ?? null;
    // A Turnstile token, then /api/demo/verify (the ticket for this anonymous
    // session and address). Any failure counts as 234's demo_unverified.
    const token = () => new Promise<string>((resolve, reject) => {
      if (!siteKey) return reject(new Error("demo_unverified"));
      pending.current = { resolve, reject };
      setChallenge((n) => n + 1);
    });
    const verify = async (t: string) => {
      const res = await fetch("/api/demo/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t }) });
      if (!res.ok) throw new Error("demo_unverified");
    };
    void (async () => {
      try {
        const on = demoTestOn(location.search, testAllowed) || (await publicFlag(supabase, "demo_mode"));
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
        // A new visitor passes the check BEFORE any session is made; a
        // returning one (an open sandbox answers "ready" with no ticket) only
        // when 234 asks (demo_unverified).
        const start = () => supabase.rpc("start_demo", { p_country: country, p_locale: locale });
        let startError: { message?: string } | null;
        if (!user) {
          const t = await token();
          if (!live) return;
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          fresh = true;
          try { await verify(t); } catch (e) { startError = { message: (e as Error).message }; }
          startError ??= (await start()).error;
        } else {
          startError = (await start()).error;
          if (refusal(startError) === "demo_unverified") {
            const t = await token();
            if (!live) return;
            try { await verify(t); startError = (await start()).error; } catch (e) { startError = { message: (e as Error).message }; }
          }
        }
        const refused = refusal(startError);
        if (refused) await cleanUp(true);
        // 234: demo_busy = over the abuse caps (per IP / in total): a moment.
        if (refused === "demo_busy") {
          if (live) setState("busy");
          return;
        }
        // 234: demo_off = the switch (and the testers' window) is off on the
        // server, whatever this page thought: the sign-up card.
        if (refused === "demo_off") {
          if (live) setState("unavailable");
          return;
        }
        // demo_unverified (the check failed): cleaned up above, a retry.
        if (startError) throw startError;
        track("demo_start", { platform: "web", c: country });
        window.location.replace(`${prefix}/dashboard`);
      } catch {
        await cleanUp(false);
        if (live) setState("error");
      }
    })();
    return () => { live = false; };
  }, [attempt, country, locale, prefix, testAllowed, siteKey]);

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />
        {state === "loading" && (
          <div data-testid="demo-loading" role="status" className="flex flex-col items-center gap-4 py-6">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#F59E0B] border-t-transparent" aria-hidden="true" />
            <p className="text-base font-semibold text-slate-800">{t("loading")}</p>
            <p data-testid="demo-loading-hint" className="text-center text-xs font-semibold text-slate-500"><span aria-hidden="true">⚠️ </span>{t("realDataHint")}</p>
            {challenge > 0 && (
              <DemoTurnstile key={challenge} siteKey={siteKey} locale={locale}
                onToken={(tok) => { pending.current?.resolve(tok); pending.current = null; }}
                onError={() => { pending.current?.reject(new Error("demo_unverified")); pending.current = null; }} />
            )}
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
        {state === "busy" && (
          <div data-testid="demo-busy" role="status" className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-slate-700">{t("busy")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{t("retry")}</button>
              <a href={`${prefix}/auth/signup?c=${country}`} className="rounded-full bg-[#0D9488] px-4 py-2 text-sm font-bold text-white">{t("signup")}</a>
            </div>
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
