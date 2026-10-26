"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { demoCount, type DemoClientMetric } from "@/lib/demoMetrics";
import { DemoAndroidQr, DemoSignUpButtons, onDemoValue } from "./DemoGate";

// "Explore em 2 minutos" (specs/demo-mode.md): the demo's own tour, four
// steps with a progress ring. Steps 1–2 complete by visiting the agenda and a
// patient's record; 3–4 on their moments of value (the first prescription
// PDF, the first SolvyAI answer). "Mostrar" takes the visitor there and
// spotlights the right button. All four done: the sign-up ask. It can be
// closed; the "?" in the DEMO bar brings it back. Progress lives in this
// tab's sessionStorage (the demo itself lives 24 h at most).
const STORE = "solvymed-demo-tour";
export const DEMO_TOUR_OPEN_EVENT = "solvymed:demo-tour-open";
type Saved = { done: number[]; closed: boolean };
const STEPS = [1, 2, 3, 4] as const;

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      if (Array.isArray(v.done)) return { done: v.done.filter((n) => STEPS.includes(n as 1)), closed: !!v.closed };
    }
  } catch {
    // Storage blocked or corrupt: start over.
  }
  return { done: [], closed: false };
}
function save(v: Saved) {
  try { sessionStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage blocked */ }
}

// A pulsing ring on the step's button for a few seconds (waits for the page
// after a navigation). One pending search at a time: a new "Mostrar" or the
// tour leaving the page cancels it (cf, #610: an uncancelled retry fired
// after teardown).
let spotTimer: number | undefined;
function cancelSpotlight() {
  if (typeof window !== "undefined") window.clearTimeout(spotTimer);
  spotTimer = undefined;
}
function spotlight(selector: string) {
  cancelSpotlight();
  let tries = 0;
  const find = () => {
    spotTimer = undefined;
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      if (++tries < 30) spotTimer = window.setTimeout(find, 100);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("demo-spotlight");
    window.setTimeout(() => el.classList.remove("demo-spotlight"), 6000);
  };
  find();
}

export function DemoTour({ locale, country }: { locale: string; country: CountryChoice }) {
  const t = useTranslations("demo");
  const pathname = usePathname();
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [state, setState] = useState<Saved>({ done: [], closed: false });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const s = load();
    setState(s);
    // Expanded on computers, a pill on phones (never covering the page).
    setOpen(typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 1024px)").matches : true);
    // Leaving the page: no spotlight search left running.
    return cancelSpotlight;
  }, []);

  const complete = (n: number) => setState((s) => {
    if (s.done.includes(n)) return s;
    const next = { ...s, done: [...s.done, n].sort() };
    save(next);
    track("demo_step", { n });
    void demoCount(`tour_step_${n}` as DemoClientMetric);
    if (next.done.length === STEPS.length) {
      track("demo_tour_done");
      setOpen(true);
    }
    return next;
  });

  // Steps 1–2: the pages themselves.
  useEffect(() => {
    if (/\/dashboard\/schedule(\/|$)/.test(pathname)) complete(1);
    if (/\/dashboard\/patients\/[^/]+$/.test(pathname)) complete(2);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Steps 3–4: their moments of value.
  useEffect(() => onDemoValue((kind) => {
    if (kind === "prescription") complete(3);
    if (kind === "solvyai") complete(4);
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reopen = () => setState((s) => { const next = { ...s, closed: false }; save(next); setOpen(true); return next; });
    window.addEventListener(DEMO_TOUR_OPEN_EVENT, reopen);
    return () => window.removeEventListener(DEMO_TOUR_OPEN_EVENT, reopen);
  }, []);

  if (state.closed) return null;
  const doneCount = state.done.length;
  const allDone = doneCount === STEPS.length;
  const nextStep = STEPS.find((n) => !state.done.includes(n));

  function go(n: number) {
    if (n === 1) {
      router.push(`${prefix}/dashboard/schedule`);
      spotlight('[data-demo-target="agenda"]');
    } else if (n === 2) {
      router.push(`${prefix}/dashboard/patients`);
      spotlight('[data-demo-target="patient-row"]');
    } else if (n === 3) {
      if (/\/dashboard\/patients\/[^/]+$/.test(pathname)) {
        // The button lives in the Prescriptions tab: the tab first, if closed.
        spotlight(document.querySelector('[data-demo-target="new-prescription"]') ? '[data-demo-target="new-prescription"]' : '[data-demo-target="rx-tab"]');
      } else {
        router.push(`${prefix}/dashboard/patients`);
        spotlight('[data-demo-target="patient-row"]');
      }
    } else {
      spotlight('[data-tour="solvyai"]');
      document.querySelector<HTMLElement>('[data-tour="solvyai"]')?.click();
    }
  }

  const ring = (
    <span data-testid="demo-tour-ring" aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(#0D9488 0 ${doneCount * 25}%, #E2E8F0 ${doneCount * 25}% 100%)` }}>
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-700">{doneCount}/4</span>
    </span>
  );

  if (!open) {
    return (
      <button type="button" data-testid="demo-tour" onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1rem+var(--consent-h,0px))] left-4 z-[56] flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-sm font-bold text-slate-800 shadow-lg ring-1 ring-slate-200">
        {ring}
        {t("tourTitle")}
      </button>
    );
  }

  return (
    <aside data-testid="demo-tour" aria-label={t("tourTitle")}
      className="demo-tour-card fixed bottom-[calc(1rem+var(--consent-h,0px))] left-4 right-4 z-[56] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:left-auto sm:w-80">
      <div className="mb-2 flex items-center gap-3">
        {ring}
        <strong className="flex-1 text-sm text-slate-900">{allDone ? t("tourDoneTitle") : t("tourTitle")}</strong>
        <button type="button" aria-label={t("tourMinimize")} onClick={() => setOpen(false)} className="px-1 text-slate-400 hover:text-slate-600">–</button>
        <button type="button" aria-label={t("close")} onClick={() => setState((s) => { const next = { ...s, closed: true }; save(next); return next; })} className="px-1 text-slate-400 hover:text-slate-600">✕</button>
      </div>
      {allDone ? (
        <>
          <p className="mb-3 text-sm text-slate-600"><span aria-hidden="true">🎉 </span>{t("tourDoneBody")}</p>
          <DemoSignUpButtons locale={locale} country={country} where="tour" />
          <DemoAndroidQr />
        </>
      ) : (
        <ol className="grid gap-1.5">
          {STEPS.map((n) => {
            const done = state.done.includes(n);
            return (
              <li key={n} data-testid={`demo-tour-step-${n}`} data-done={done ? "true" : undefined}
                className={`flex items-center justify-between gap-2 text-sm ${done ? "text-slate-400 line-through" : n === nextStep ? "font-bold text-slate-900" : "text-slate-700"}`}>
                <span>{t(`tourStep${n}`)}</span>
                {!done && (
                  <button type="button" onClick={() => go(n)} className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-teal-700 no-underline hover:bg-teal-50">
                    {t("tourShow")}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
