"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isDemoUser, leaveDemo } from "@/lib/demo";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { isAndroidWebView, playStoreUrlForVisit, storeLinkForAgent } from "@/lib/appStores";
import { fallBackIfStillVisible, STORE_FALLBACK_MS } from "@/lib/storeFallback";
import { consentedVisit } from "@/lib/consentedVisit";

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
    <div role="dialog" aria-modal="true" data-testid="demo-blocked-sheet" data-kind={open} className="fixed inset-x-0 bottom-[var(--consent-h,0px)] z-[70] mx-auto max-w-md rounded-t-2xl border border-amber-200 bg-white p-5 shadow-2xl">
      <button type="button" onClick={() => setOpen(null)} aria-label="✕" className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">✕</button>
      <BlockedMessage kind={open} onSignUp={() => void signUpFromDemo(locale, country, open === "aiQuota" ? "ai_quota" : "blocked")} />
    </div>
  );
}

// ── Moments of value (specs/demo-mode.md) ─────────────────────────────────
// Right after the first prescription PDF, the first booked appointment and
// the first SolvyAI answer: one sign-up sheet, once each per demo (this
// tab's sessionStorage; the demo itself lives 24 h at most), dismissible.
export type DemoValueKind = "prescription" | "appointment" | "solvyai";
const VALUE_EVENT = "solvymed:demo-value";
export function notifyDemoValue(kind: DemoValueKind) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<DemoValueKind>(VALUE_EVENT, { detail: kind }));
}
export function onDemoValue(handler: (kind: DemoValueKind) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<DemoValueKind>).detail);
  window.addEventListener(VALUE_EVENT, listener);
  return () => window.removeEventListener(VALUE_EVENT, listener);
}

const seenKey = (kind: DemoValueKind) => `solvymed-demo-value-${kind}`;
function seenOnce(kind: DemoValueKind): boolean {
  try {
    if (sessionStorage.getItem(seenKey(kind))) return true;
    sessionStorage.setItem(seenKey(kind), "1");
  } catch {
    // Storage blocked: shown once per page load instead.
  }
  return false;
}

// Google first (one tap), then e-mail; both end the demo and sign out first.
async function googleFromDemo(locale: string, country: CountryChoice, where: string) {
  track("demo_signup_click", { where, method: "google" });
  await leaveDemo(createClient());
  const { googleRedirectTo, startGoogleSignIn } = await import("@/lib/googleSignIn");
  const { error } = await startGoogleSignIn(createClient(), googleRedirectTo(window.location.origin, { locale, country, role: "professional", source: "signup" }));
  // Google couldn't start: the sign-up form, where Google is offered again.
  if (error) window.location.assign(`${locale === "en" ? "" : `/${locale}`}/auth/signup?c=${country}&via=demo`);
}

export function DemoSignUpButtons({ locale, country, where }: { locale: string; country: CountryChoice; where: string }) {
  const t = useTranslations("demo");
  const tg = useTranslations("auth.google");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void googleFromDemo(locale, country, where); }}
        className="flex items-center justify-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:opacity-60">
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
        {tg("continue")}
      </button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void signUpFromDemo(locale, country, where); }}
        className="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {t("emailSignup")}
      </button>
    </div>
  );
}

// "Também no Android" + a QR code to solvymed.com/app (the smart link): on
// computers only, so a doctor can carry on with the phone. The app's demo is
// its own sandbox: never "continue this demo in the app".
export function DemoAndroidQr() {
  const t = useTranslations("demo");
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData("https://www.solvymed.com/app");
      qr.make();
      setSrc(qr.createDataURL(3, 6));
    });
  }, []);
  if (!src) return null;
  return (
    <div data-testid="demo-android-qr" className="mt-3 hidden items-center gap-3 border-t border-slate-100 pt-3 lg:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={72} height={72} className="h-[72px] w-[72px]" />
      <p className="text-xs text-slate-500">{t("androidQr")}</p>
    </div>
  );
}

export function DemoValueSheet({ locale, country }: { locale: string; country: CountryChoice }) {
  const t = useTranslations("demo");
  const [kind, setKind] = useState<DemoValueKind | null>(null);
  useEffect(() => onDemoValue((k) => {
    track("demo_value", { type: k });
    if (!seenOnce(k)) setKind(k);
  }), []);
  if (!kind) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="demo-value-title" data-testid="demo-value-sheet" data-kind={kind}
      className="fixed inset-x-0 bottom-[var(--consent-h,0px)] z-[70] mx-auto max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:bottom-[calc(1rem+var(--consent-h,0px))] sm:rounded-2xl">
      <button type="button" onClick={() => setKind(null)} aria-label={t("close")} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">✕</button>
      <h2 id="demo-value-title" className="pr-6 text-lg font-extrabold leading-snug text-slate-900">{t("valueTitle")}</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">{t("valueBody")}</p>
      <DemoSignUpButtons locale={locale} country={country} where={`sheet_${kind}`} />
      <DemoAndroidQr />
    </div>
  );
}

// Don't enter real patient data (the spec's guardrail; 01's copy, cf):
// on phones, where the bar holds only DEMO + the button, a one-time,
// dismissible line under the bar (computers read it inside the bar).
const HINT_KEY = "solvymed-demo-real-data-hint";
export function DemoRealDataHint() {
  const t = useTranslations("demo");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let closed = false;
    try { closed = localStorage.getItem(HINT_KEY) === "closed"; } catch { /* storage blocked: show it */ }
    setShow(!closed);
  }, []);
  if (!show) return null;
  return (
    <div data-testid="demo-real-data-hint" role="note" className="flex max-w-md items-center gap-2 rounded-xl bg-[#FEF3C7] py-1 pl-3 pr-1 text-xs font-semibold text-[#1F2937] shadow-md ring-1 ring-[#F59E0B]/40">
      <span><span aria-hidden="true">⚠️ </span>{t("realDataHint")}</span>
      <button type="button" aria-label={t("close")} onClick={() => { try { localStorage.setItem(HINT_KEY, "closed"); } catch { /* ok */ } setShow(false); }}
        className="shrink-0 rounded-full px-1.5 text-[#1F2937]/50 hover:text-[#1F2937]">✕</button>
    </div>
  );
}

// The same line, small and muted, above Save where real data would go (new
// or edited patient, record, prescription); in the demo only.
export function DemoRealDataNote() {
  const { demo } = useDemo();
  const t = useTranslations("demo");
  if (!demo) return null;
  return <p data-testid="demo-real-data-note" className="text-xs text-slate-500"><span aria-hidden="true">⚠️ </span>{t("realDataHint")}</p>;
}

// Android phones (the web demo): a slim, dismissible chip under the amber
// bar, to the Play listing with the consented campaign (F5's onClick logic).
// Never stronger than DEMO and the sign-up button. iPhone: nothing.
export function DemoAndroidChip() {
  const t = useTranslations("demo");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let closed = false;
    try { closed = sessionStorage.getItem("solvymed-demo-android-chip") === "closed"; } catch { /* storage blocked */ }
    setShow(!closed && /Android.+Mobile/i.test(navigator.userAgent));
  }, []);
  if (!show) return null;
  return (
    <div data-testid="demo-android-chip" className="flex justify-center">
      <div className="flex items-center gap-2 rounded-full bg-white/95 py-1 pl-3 pr-1 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200">
        <a href="https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed" target="_blank" rel="noopener noreferrer"
          onClick={(e) => {
            // Set before the browser follows the link (F5: the consented campaign):
            // the Play Store app (an intent, the website as its fallback) in
            // this tab; a plain WebView keeps the https link (#601).
            const web = playStoreUrlForVisit("landing", consentedVisit());
            e.currentTarget.href = storeLinkForAgent(navigator.userAgent, web);
            if (!isAndroidWebView(navigator.userAgent)) {
              e.currentTarget.target = "_self";
              // Play disabled or stubbed: the intent does nothing, so the web listing.
              fallBackIfStillVisible(web, STORE_FALLBACK_MS);
            }
            track("app_store_click", { platform: "android", from: "demo" });
          }}
          className="underline-offset-2 hover:underline">
          {t("androidChip")}
        </a>
        <button type="button" aria-label={t("close")} onClick={() => { try { sessionStorage.setItem("solvymed-demo-android-chip", "closed"); } catch { /* ok */ } setShow(false); }}
          className="rounded-full px-1.5 text-slate-400 hover:text-slate-600">✕</button>
      </div>
    </div>
  );
}
