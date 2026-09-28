"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TourOverlay } from "./TourOverlay";
import { tourSteps, TOUR_EVENTS, type PaymentQr, type TourRole } from "@/lib/tour";
import { saveTourProgress } from "@/lib/tourActions";
import { track } from "@/lib/track";

// Runs the guided tour inside the dashboard (specs/walkthrough.md):
// - "auto": first sign-in after sign-up (no saved state) → starts by itself
//   on the dashboard home, unless a one-time card is showing there
//   (data-tour-block, e.g. the secretary's welcome), then it waits for the
//   next visit;
// - "resume": left mid-tour → a small card offers to continue, once;
// - start(): replay from Settings, any time.
// Progress is saved on the server (migration 113); before it, nothing is
// saved and nothing starts by itself.

type TourCtx = { start: () => void };
const Ctx = createContext<TourCtx>({ start: () => {} });
export const useTour = () => useContext(Ctx);

export function TourProvider({
  role,
  paymentQr,
  prefix,
  entry,
  resumeStep = 0,
  children,
}: {
  role: TourRole;
  paymentQr: PaymentQr;
  prefix: string;
  entry: "auto" | "resume" | null;
  resumeStep?: number;
  children: ReactNode;
}) {
  const t = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => tourSteps(role, paymentQr), [role, paymentQr]);
  const [active, setActive] = useState<{ startAt: number; replay: boolean } | null>(null);
  const [offerResume, setOfferResume] = useState(entry === "resume");
  const autoTried = useRef(false);
  const home = `${prefix}/dashboard`;

  const begin = useCallback((startAt: number, replay: boolean) => {
    setOfferResume(false);
    setActive({ startAt, replay });
    track(replay ? TOUR_EVENTS.replayed : TOUR_EVENTS.started, { role });
    void saveTourProgress("started", startAt);
  }, [role]);

  // First sign-in: start on the home page once it's rendered.
  useEffect(() => {
    if (entry !== "auto" || autoTried.current || pathname !== home) return;
    autoTried.current = true;
    const id = setTimeout(() => {
      if (document.querySelector("[data-tour-block]")) return; // a one-time card first
      begin(0, false);
    }, 600);
    return () => clearTimeout(id);
  }, [entry, pathname, home, begin]);

  const onStep = useCallback((index: number) => {
    track(TOUR_EVENTS.step, { role, step: index + 1 });
    void saveTourProgress("started", index);
  }, [role]);

  const onClose = useCallback((result: "completed" | "skipped", index: number) => {
    setActive(null);
    track(result === "completed" ? TOUR_EVENTS.completed : TOUR_EVENTS.skipped, { role, step: index + 1 });
    void saveTourProgress(result, index);
    // Doctors land on the setup checklist afterwards (as in 1.3.0).
    if (role === "professional") router.push(`${home}?setup=1`);
  }, [role, router, home]);

  const ctx = useMemo<TourCtx>(() => ({ start: () => begin(0, true) }), [begin]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {active && (
        <TourOverlay steps={steps} prefix={prefix} startAt={active.startAt} onStep={onStep} onClose={onClose} />
      )}
      {offerResume && !active && pathname === home && (
        <div role="status" className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">{t("resumeTitle", { n: Math.min(resumeStep + 1, steps.length), total: steps.length })}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setOfferResume(false); void saveTourProgress("skipped", resumeStep); }}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              {t("dismiss")}
            </button>
            <button type="button" onClick={() => begin(Math.min(resumeStep, steps.length - 1), false)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-teal-700">
              {t("continue")}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Settings → "Replay the tour", any time.
export function TourSettingsCard() {
  const t = useTranslations("tour");
  const { start } = useTour();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-bold text-slate-900">{t("settingsCardTitle")}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{t("settingsCardText")}</p>
      </div>
      <button type="button" onClick={start} className="rounded-xl border-2 border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50">
        {t("replay")}
      </button>
    </div>
  );
}
