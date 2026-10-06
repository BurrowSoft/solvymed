"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TourOverlay } from "./TourOverlay";
import { tourSteps, TOUR_EVENTS, type PaymentQr, type TourRole, type TourStep } from "@/lib/tour";
import { CURRENT_NEWS, NEWS, newsItemsFor, newsSteps, newsTourId } from "@/lib/news";
import { NewsPopup } from "./NewsPopup";
import { SolvyAiIntroPopup } from "./SolvyAiIntroPopup";
import { SOLVYAI_INTRO_TOUR } from "@/lib/solvyaiIntro";
import { liveFeatures } from "@/lib/liveFeatures";
import { saveTourProgress } from "@/lib/tourActions";
import { CLOSED_EVENT, OPEN_EVENT } from "@/components/solvyai/SolvyAiSettings";
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

// The Novidades popup (walkthrough §4a), when on (liveFeatures.news):
// shown once per release per account (migration 113, tour
// "news:<release>"), only on the dashboard home, never over the main tour
// or a one-time card; a new user gets it right after the main tour ends
// or is skipped. [See what's new] runs a short spotlight tour of just the
// new items; [Not now] closes it for good (Settings → What's new keeps it).

type TourCtx = { start: () => void; startNews: (release: string, replay?: boolean) => void; role: TourRole };
const Ctx = createContext<TourCtx>({ start: () => {}, startNews: () => {}, role: "professional" });
export const useTour = () => useContext(Ctx);

export function TourProvider({
  role,
  paymentQr,
  prefix,
  entry,
  resumeStep = 0,
  newsPending = false,
  introPending = false,
  introTestable = false,
  children,
}: {
  role: TourRole;
  paymentQr: PaymentQr;
  prefix: string;
  entry: "auto" | "resume" | null;
  resumeStep?: number;
  // The current release's Novidades haven't been seen (and the popup is on).
  newsPending?: boolean;
  // "Meet SolvyAI" hasn't been seen and SolvyAI is live (lib/solvyaiIntro).
  introPending?: boolean;
  // ?solvyai-intro=1 works (not Production; the layout decides).
  introTestable?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("tour");
  const tIntro = useTranslations("solvyaiIntro");
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => tourSteps(role, paymentQr), [role, paymentQr]);
  const [active, setActive] = useState<{ startAt: number; replay: boolean } | null>(null);
  const newsItems = useMemo(() => newsItemsFor(CURRENT_NEWS, role), [role]);
  const [newsPopup, setNewsPopup] = useState(false);
  const [newsTour, setNewsTour] = useState<{ release: string; steps: TourStep[]; replay: boolean } | null>(null);
  // Not yet shown or answered in this visit.
  const newsWaiting = useRef(newsPending && newsItems.length > 0);
  // Testing (flag on only): /dashboard?news=1 opens the popup even when this
  // release's announcement was already seen, or before migration 113.
  useEffect(() => {
    if (liveFeatures.news && newsItems.length > 0 && new URLSearchParams(window.location.search).get("news") === "1") {
      newsWaiting.current = true;
    }
  }, [newsItems.length]);
  // "Meet SolvyAI ✦" (UX, go-live): doctors, once, after the tour and the
  // Novidades popup, never on top of them. Testing (panel flag on, and
  // never on Production: introTestable, from the server's VERCEL_ENV; UX):
  // /dashboard?solvyai-intro=1 opens it even when already seen.
  const [introPopup, setIntroPopup] = useState(false);
  const introWaiting = useRef(introPending && role === "professional");
  useEffect(() => {
    if (introTestable && liveFeatures.solvyAi && role === "professional" && new URLSearchParams(window.location.search).get("solvyai-intro") === "1") {
      introWaiting.current = true;
    }
  }, [role, introTestable]);
  const [offerResume, setOfferResume] = useState(entry === "resume");
  // Where "Continuar" picks up: the saved step, or the step after SolvyAI
  // when "Experimentar agora" paused the tour (UX 36, like the app).
  const [resumeAt, setResumeAt] = useState(resumeStep);
  const paused = useRef(false);
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

  const onClose = useCallback((result: "completed" | "skipped" | "none", index: number) => {
    setActive(null);
    // Nothing could be shown (nothing on screen): nothing is recorded.
    if (result === "none") return;
    track(result === "completed" ? TOUR_EVENTS.completed : TOUR_EVENTS.skipped, { role, step: index + 1 });
    void saveTourProgress(result, index);
    // Doctors land on the setup checklist afterwards (as in 1.3.0).
    if (role === "professional") router.push(`${home}?setup=1`);
  }, [role, router, home]);

  // The Novidades popup: on the home page, when nothing else is on screen.
  // After the main tour (auto-started for a new user) it comes right after.
  useEffect(() => {
    if (!newsWaiting.current || active || newsTour || newsPopup || pathname !== home) return;
    if (entry === "auto" && !autoTried.current) return; // the main tour goes first
    const id = setTimeout(() => {
      if (!newsWaiting.current || document.querySelector("[data-tour-block]")) return;
      newsWaiting.current = false;
      setNewsPopup(true);
      // The Novidades already announced SolvyAI: "Meet SolvyAI" counts as seen (the app's rule).
      if (newsItems.some((i) => i.id === "solvyai")) {
        introWaiting.current = false;
        void saveTourProgress("skipped", 0, SOLVYAI_INTRO_TOUR);
      }
      track("news_shown", { release: CURRENT_NEWS.release, role });
    }, 800);
    return () => clearTimeout(id);
  }, [active, newsTour, newsPopup, pathname, home, entry, role, newsItems]);

  // "Meet SolvyAI": on the home page, after everything else. It counts as
  // seen once shown (skipped; completed on Try it now), like the app.
  useEffect(() => {
    if (!introWaiting.current || active || newsTour || newsPopup || introPopup || newsWaiting.current || pathname !== home) return;
    if (entry === "auto" && !autoTried.current) return;
    const id = setTimeout(() => {
      if (!introWaiting.current || newsWaiting.current || document.querySelector("[data-tour-block]")) return;
      introWaiting.current = false;
      setIntroPopup(true);
      track("solvyai_intro_shown", { role });
      void saveTourProgress("skipped", 0, SOLVYAI_INTRO_TOUR);
    }, 900);
    return () => clearTimeout(id);
  }, [active, newsTour, newsPopup, introPopup, pathname, home, entry, role]);

  const introTry = useCallback(() => {
    setIntroPopup(false);
    track("solvyai_intro_try", { role });
    void saveTourProgress("completed", 0, SOLVYAI_INTRO_TOUR);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { chip: tIntro("whatCanDo") } }));
  }, [role, tIntro]);
  const introLater = useCallback(() => setIntroPopup(false), []);

  // replay: from Settings → What's new (the release was already seen, so
  // nothing is re-saved as "started").
  const startNews = useCallback((release: string, replay = false) => {
    const found = NEWS.find((n) => n.release === release);
    if (!found) return;
    const s = newsSteps(found, role);
    setNewsPopup(false);
    // No items for this role: nothing to show, nothing recorded.
    if (!s.length) return;
    // "started" is saved only once a step is actually shown (onNewsStep);
    // a replay saves nothing (the release was already seen).
    setNewsTour({ release, steps: s, replay });
  }, [role]);

  // The first news step actually on screen: the release counts as started.
  const onNewsStep = useCallback((index: number) => {
    if (index === 0 && newsTour && !newsTour.replay) void saveTourProgress("started", 0, newsTourId(newsTour.release));
  }, [newsTour]);

  const closeNewsPopup = useCallback(() => {
    setNewsPopup(false);
    track("news_dismissed", { release: CURRENT_NEWS.release, role });
    void saveTourProgress("skipped", 0, newsTourId(CURRENT_NEWS.release));
  }, [role]);

  const onNewsClose = useCallback((result: "completed" | "skipped" | "none", index: number) => {
    const release = newsTour?.release ?? CURRENT_NEWS.release;
    setNewsTour(null);
    // Not a single item could be shown: the release is NOT marked as seen
    // (UX), so the popup comes back on a later visit.
    if (result === "none" || newsTour?.replay) return;
    track(result === "completed" ? "news_tour_completed" : "news_tour_skipped", { release, role, step: index + 1 });
    void saveTourProgress(result, index, newsTourId(release));
  }, [newsTour, role]);

  // "Experimentar agora": the tour pauses on the next step and SolvyAI opens
  // with "O que o SolvyAI pode fazer?"; closing SolvyAI offers to continue.
  const onTryNow = useCallback((index: number) => {
    setActive(null);
    track("tour_try_solvyai", { role, step: index + 1 });
    const next = index + 1;
    if (next >= steps.length) {
      void saveTourProgress("completed", index);
    } else {
      void saveTourProgress("started", next);
      setResumeAt(next);
      paused.current = true;
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { text: t("tryNowQuestion") } }));
  }, [role, steps.length, t]);
  useEffect(() => {
    const on = () => { if (paused.current) { paused.current = false; setOfferResume(true); } };
    window.addEventListener(CLOSED_EVENT, on);
    return () => window.removeEventListener(CLOSED_EVENT, on);
  }, []);

  const ctx = useMemo<TourCtx>(() => ({ start: () => begin(0, true), startNews, role }), [begin, startNews, role]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {active && (
        <TourOverlay steps={steps} prefix={prefix} startAt={active.startAt} onStep={onStep} onClose={onClose} onTryNow={onTryNow} />
      )}
      {newsTour && !active && (
        <TourOverlay steps={newsTour.steps} prefix={prefix} stepsNamespace="news" onStep={onNewsStep} onClose={onNewsClose} />
      )}
      {newsPopup && !active && !newsTour && (
        <NewsPopup items={newsItems} onSee={() => startNews(CURRENT_NEWS.release)} onLater={closeNewsPopup} />
      )}
      {introPopup && !active && !newsTour && !newsPopup && (
        <SolvyAiIntroPopup onTry={introTry} onLater={introLater} />
      )}
      {/* Above the SolvyAI ✦ button's corner (bottom-5 right-5), never on top
          of it: a new doctor sees both on day one (53, cf 6 Oct). */}
      {offerResume && !active && pathname === home && (
        <div role="status" data-testid="tour-resume" className="fixed bottom-24 right-4 z-50 w-72 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">{t("resumeTitle", { n: Math.min(resumeAt + 1, steps.length), total: steps.length })}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setOfferResume(false); void saveTourProgress("skipped", resumeAt); }}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              {t("dismiss")}
            </button>
            <button type="button" onClick={() => begin(Math.min(resumeAt, steps.length - 1), false)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-teal-700">
              {t("continue")}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Settings → "What's new" (when the popup is on): each release's items for
// this role, with "Show" to run that release's short tour again.
export function NewsSettingsCard() {
  const t = useTranslations("news");
  const { startNews, role } = useTour();
  const releases = NEWS.map((n) => ({ release: n.release, items: newsItemsFor(n, role) })).filter((n) => n.items.length);
  if (!releases.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t("cardTitle")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("cardSub")}</p>
      <div className="mt-4 space-y-4">
        {releases.map((r) => (
          <div key={r.release} className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">{r.release}</p>
              <ul className="mt-1 space-y-1">
                {r.items.map((i) => (
                  <li key={i.id} className="text-sm text-slate-700">
                    <span className="font-semibold">{t(i.titleKey)}</span>: {t(i.lineKey)}
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={() => startNews(r.release, true)} className="rounded-xl border-2 border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50">
              {t("show")}
            </button>
          </div>
        ))}
      </div>
    </div>
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
