"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
// serverOn: the switch as the server read it (#604; null = unknown, so the
// browser reads it).
export function DemoClient({ testAllowed, siteKey, serverOn = null }: { testAllowed: boolean; siteKey: string; serverOn?: boolean | null }) {
  const t = useTranslations("demo");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const prefix = locale === "en" ? "" : `/${locale}`;
  const country = demoCountry(locale);
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);
  // The router in a ref: the start runs once per attempt, whatever re-renders.
  const router = useRef(useRouter());
  // The loading card's real steps (#604, E): verify → create → open.
  const [step, setStep] = useState<"verify" | "create" | "open">("verify");
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
    setStep("verify");
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
    // One call (#604, C): the ticket, then start_demo with this session, on
    // the server. Its answer: null (ready) or the refusal, as start_demo's.
    const verifyAndStart = async (t: string): Promise<{ message: string } | null> => {
      try {
        const res = await fetch("/api/demo/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t, country, locale }) });
        const body = (await res.json().catch(() => ({}))) as { status?: string; code?: string };
        if (res.ok && body.status === "ready") return null;
        return { message: res.ok ? "demo_unverified" : body.code ?? "demo_unverified" };
      } catch {
        return { message: "demo_unverified" };
      }
    };
    // The dashboard's code, fetched while the server works (#604, D).
    const warm = () => { try { router.current.prefetch(`${prefix}/dashboard`); } catch { /* best-effort */ } };
    // Timing marks for the testers (performance.getEntriesByType("mark")):
    // nothing is sent anywhere (#604, 0e's split).
    const mark = (n: string) => { try { performance.mark(`demo:${n}`); } catch { /* not supported */ } };
    mark("start");
    void (async () => {
      try {
        // In parallel (#604): the switch and the session; the widget only
        // once the demo is known to be on.
        const [on, { data: { user } }] = await Promise.all([
          serverOn !== null ? Promise.resolve(serverOn) : demoTestOn(location.search, testAllowed) ? Promise.resolve(true) : publicFlag(supabase, "demo_mode"),
          supabase.auth.getUser(),
        ]);
        mark("switch-and-session");
        if (!live) return;
        if (!on) {
          setState("unavailable");
          return;
        }
        if (user && !isDemoUser(user)) {
          setState("signedIn");
          return;
        }
        let startError: { message?: string } | null;
        if (!user) {
          // A new visitor: the Turnstile solve and the anonymous sign-in run
          // together (01: a bare anonymous user is no new exposure; 235's
          // cleanup and a refusal's end_demo remove it), then one call that
          // mints the ticket AND starts the demo on the server.
          const [t] = await Promise.all([
            token().then((tok) => { mark("token"); return tok; }),
            supabase.auth.signInAnonymously().then(({ error }) => { if (error) throw error; fresh = true; mark("signed-in"); }),
          ]);
          if (!live) return;
          warm();
          setStep("create");
          startError = await verifyAndStart(t);
          mark("verified-and-started");
        } else {
          // A returning session: an open sandbox answers "ready" with no
          // ticket; the check only when 234 asks (demo_unverified).
          warm();
          setStep("create");
          startError = (await supabase.rpc("start_demo", { p_country: country, p_locale: locale })).error;
          if (refusal(startError) === "demo_unverified") {
            setStep("verify");
            const t = await token();
            if (!live) return;
            setStep("create");
            startError = await verifyAndStart(t);
          mark("verified-and-started");
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
        if (!live) return;
        mark("open-dashboard");
        setStep("open");
        // In-app navigation to the prefetched dashboard (no full reload).
        router.current.replace(`${prefix}/dashboard`);
      } catch {
        await cleanUp(false);
        if (live) setState("error");
      }
    })();
    return () => { live = false; };
  }, [attempt, country, locale, prefix, testAllowed, siteKey, serverOn]);

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />
        {state === "loading" && (
          <div data-testid="demo-loading" role="status" className="flex flex-col items-center gap-4 py-6">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#F59E0B] border-t-transparent" aria-hidden="true" />
            <p data-testid="demo-step" data-step={step} className="text-base font-semibold text-slate-800">
              {step === "verify" ? t("verifying") : step === "create" ? t("stepCreate") : t("stepOpen")}
            </p>
            <div className="flex w-48 gap-1" aria-hidden="true">
              {(["verify", "create", "open"] as const).map((s, i) => (
                <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= ["verify", "create", "open"].indexOf(step) ? "bg-[#F59E0B]" : "bg-slate-200"}`} />
              ))}
            </div>
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
