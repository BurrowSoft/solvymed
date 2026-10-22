"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isDemoUser, leaveDemo } from "@/lib/demo";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";

// Demo guards on the web (specs/demo-mode.md; 234's contract §5). The server
// refuses every real-world side effect (demo_not_allowed, the storage policy,
// the web routes); the UI says so first: in a demo, each known-blocked
// control is shown inert with "Disponível na sua conta" + the sign-up CTA
// (DemoGate), and any demo_not_allowed that still reaches the page opens the
// same message (notifyDemoBlocked → DemoBlockedSheet, mounted by DemoBar).

type DemoInfo = { demo: boolean; locale: string; country: CountryChoice };
const DemoContext = createContext<DemoInfo>({ demo: false, locale: "en", country: "BR" });

// The dashboard layout knows (server-side) whether the session is a demo one.
export function DemoProvider({ value, children }: { value: DemoInfo; children: ReactNode }) {
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo(): DemoInfo {
  return useContext(DemoContext);
}

// Pages outside the dashboard (the public booking pages, /subscribe): read
// the session once on the client.
export function useDemoSession(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let live = true;
    // Never breaks the page: any failure is "not a demo" (the server refuses anyway).
    void (async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (live) setDemo(isDemoUser(user));
      } catch {
        // Not a demo as far as this page can tell.
      }
    })();
    return () => { live = false; };
  }, []);
  return demo;
}

const BLOCKED_EVENT = "solvymed:demo-blocked";
// "blocked": a refused action (demo_not_allowed); "aiQuota": the demo's 5
// SolvyAI messages are used (demo_quota).
export type DemoBlockKind = "blocked" | "aiQuota";
export function notifyDemoBlocked(kind: DemoBlockKind = "blocked") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<DemoBlockKind>(BLOCKED_EVENT, { detail: kind }));
}

// Leaves the demo for the sign-up (as the bar's button: end_demo + sign-out
// first, then the form with the demo's country).
export async function signUpFromDemo(locale: string, country: CountryChoice, where: string) {
  track("demo_signup_click", { where });
  await leaveDemo(createClient());
  const prefix = locale === "en" ? "" : `/${locale}`;
  window.location.assign(`${prefix}/auth/signup?c=${country}&via=demo`);
}

function BlockedMessage({ onSignUp, kind = "blocked" }: { onSignUp: () => void; kind?: DemoBlockKind }) {
  const t = useTranslations("demo");
  return (
    <>
      <p className="text-sm font-semibold text-slate-800">{t(kind === "aiQuota" ? "aiQuotaTitle" : "blocked")}</p>
      <p className="mt-1 text-xs text-slate-500">{t(kind === "aiQuota" ? "aiQuotaBody" : "blockedBody")}</p>
      <button type="button" onClick={onSignUp}
        className="mt-3 w-full rounded-full bg-[#0D9488] px-4 py-2 text-sm font-bold text-white hover:bg-[#0B7F75]">
        {t("signup")}
      </button>
    </>
  );
}

// Wraps a control the demo can't use. Outside a demo: the control as it is.
// In a demo: the control inert and faded, and a tap anywhere on it opens
// "Disponível na sua conta" with the sign-up CTA (never a failing request).
export function DemoGate({ children, demo: forced, className = "" }: { children: ReactNode; demo?: boolean; className?: string }) {
  const ctx = useDemo();
  const t = useTranslations("demo");
  const demo = forced ?? ctx.demo;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  if (!demo) return <>{children}</>;
  return (
    <div ref={ref} className={`relative ${className}`} data-testid="demo-blocked">
      <div inert aria-hidden="true" className="pointer-events-none select-none opacity-50">{children}</div>
      <button type="button" aria-label={t("blocked")} onClick={() => setOpen((o) => !o)} className="absolute inset-0 cursor-not-allowed rounded-xl" />
      {open && (
        <div role="dialog" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-amber-200 bg-white p-4 shadow-xl">
          <BlockedMessage onSignUp={() => void signUpFromDemo(ctx.locale, ctx.country, "blocked")} />
        </div>
      )}
    </div>
  );
}

// The safety net, mounted once in a demo (DemoBar): a demo_not_allowed the
// page didn't pre-empt opens the same message as a bottom sheet.
export function DemoBlockedSheet({ locale, country }: { locale: string; country: CountryChoice }) {
  const [open, setOpen] = useState<DemoBlockKind | null>(null);
  useEffect(() => {
    const show = (e: Event) => setOpen((e as CustomEvent<DemoBlockKind>).detail ?? "blocked");
    window.addEventListener(BLOCKED_EVENT, show);
    return () => window.removeEventListener(BLOCKED_EVENT, show);
  }, []);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" data-testid="demo-blocked-sheet" data-kind={open} className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-md rounded-t-2xl border border-amber-200 bg-white p-5 shadow-2xl">
      <button type="button" onClick={() => setOpen(null)} aria-label="✕" className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">✕</button>
      <BlockedMessage kind={open} onSignUp={() => void signUpFromDemo(locale, country, open === "aiQuota" ? "ai_quota" : "blocked")} />
    </div>
  );
}
