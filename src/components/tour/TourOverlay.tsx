"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./portalRoot";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TourFallback, TourStep } from "@/lib/tour";

// The tour's overlay (specs/walkthrough.md §3): the screen dimmed, the
// current element in a rounded cut-out with a teal glow, and a card next to
// it (never over it). Clicks on the dimmed area do nothing; Esc asks before
// skipping; →/Enter next, ← back. A step whose element doesn't show up is
// dropped (the count adjusts). It only navigates and highlights: it never
// clicks anything or creates data.

const PAD = 8; // space around the spotlighted element
const CARD_W = 320;
const GAP = 16;
const FIND_TIMEOUT_MS = 3000;

type Rect = { top: number; left: number; width: number; height: number };

// The first VISIBLE element for the target (the sidebar links exist twice:
// the desktop sidebar and the phone drawer). Hidden = not a step now:
// display:none, zero size, or entirely off-screen horizontally (the closed
// phone drawer is translated off the left edge, still laid out). Vertical
// position doesn't count: a target below the fold gets scrolled into view.
// Not offsetParent: a position:fixed element (the ☰ menu button) has none
// even when it's plainly visible (tester). display:none already gives a
// 0×0 rect.
export function isOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= window.innerWidth) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

// The element a step spotlights now, and the text to show with it: its own
// target, else its fallback (e.g. the menu button when its sidebar link is
// inside the closed phone drawer). Null = not a step now.
function resolveStep(s: TourStep): { el: HTMLElement; fallback: TourFallback | null } | null {
  const own = findTarget(s.target);
  if (own) return { el: own, fallback: null };
  const alt = s.fallback ? findTarget(s.fallback.target) : null;
  return alt && s.fallback ? { el: alt, fallback: s.fallback } : null;
}

function findTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    if (isOnScreen(el)) return el;
  }
  return null;
}

function cardPosition(rect: Rect, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 2 * GAP);
  const clampX = (x: number) => Math.max(GAP, Math.min(x, vw - w - GAP));
  const clampY = (y: number) => Math.max(GAP, Math.min(y, vh - cardH - GAP));
  // Right of the element (the sidebar), then below, above, left.
  if (rect.left + rect.width + PAD + GAP + w <= vw) return { left: rect.left + rect.width + PAD + GAP, top: clampY(rect.top) };
  if (rect.top + rect.height + PAD + GAP + cardH <= vh) return { left: clampX(rect.left), top: rect.top + rect.height + PAD + GAP };
  if (rect.top - PAD - GAP - cardH >= 0) return { left: clampX(rect.left), top: rect.top - PAD - GAP - cardH };
  return { left: clampX(rect.left - PAD - GAP - w), top: clampY(rect.top) };
}

export function TourOverlay({
  steps: initialSteps,
  prefix,
  startAt = 0,
  onStep,
  onClose,
  onTryNow,
  stepsNamespace = "tour",
}: {
  // Where the steps' title/text keys live ("news" for a Novidades tour).
  stepsNamespace?: "tour" | "news";
  steps: TourStep[];
  prefix: string;
  startAt?: number;
  onStep?: (index: number, step: TourStep) => void;
  // "none": no step could be shown at all (nothing on screen), so nothing
  // should be recorded as seen.
  onClose: (result: "completed" | "skipped" | "none", index: number) => void;
  // "Experimentar agora" on the SolvyAI step: pause the tour, open SolvyAI.
  onTryNow?: (index: number) => void;
}) {
  const t = useTranslations("tour");
  const tSteps = useTranslations(stepsNamespace);
  const tNav = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  // Steps on the page the tour starts on whose element isn't on screen
  // (the sidebar on a narrow screen, ...) are dropped up front, so the count
  // is right from step 1; steps on other pages are checked when reached.
  const [steps, setSteps] = useState(() =>
    typeof document === "undefined"
      ? initialSteps
      : initialSteps.filter((s) => `${prefix}${s.path}` !== pathname || resolveStep(s) !== null),
  );
  const [index, setIndex] = useState(Math.min(startAt, initialSteps.length - 1));
  const [rect, setRect] = useState<Rect | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [cardH, setCardH] = useState(200);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  // Whether any step has actually been shown (else nothing counts as seen).
  const shownAny = useRef(false);
  // The fallback in use for the spotlighted element, if any: its own text,
  // or the drawer line before the step's text.
  const [usedFallback, setUsedFallback] = useState<TourFallback | null>(null);
  // Pages whose steps were already filtered (the starting page, up front).
  const checkedPaths = useRef(new Set<string>(
    typeof window === "undefined" ? [] : initialSteps.filter((s) => `${prefix}${s.path}` === pathname).map((s) => s.path),
  ));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  const step = steps[index];
  const total = steps.length;

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Go to the step's page, wait for its element, spotlight it; drop the step
  // if the element never shows up.
  useEffect(() => {
    if (!step) return;
    setRect(null);
    setUsedFallback(null);
    targetRef.current = null;
    const wanted = `${prefix}${step.path}`;
    if (pathname !== wanted) {
      router.push(wanted);
      return; // runs again when the pathname changes
    }
    let cancelled = false;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const found = resolveStep(step);
      const el = found?.el ?? null;
      if (found && el) {
        setUsedFallback(found.fallback);
        // First time on this page (e.g. a replay started in Settings, then
        // came to the dashboard): the page is rendered now, so the later
        // steps on it whose element isn't on screen are dropped at once and
        // the count is right from here, not only as each is reached.
        if (!checkedPaths.current.has(step.path)) {
          checkedPaths.current.add(step.path);
          setSteps((all) => all.filter((s, i) => i <= index || s.path !== step.path || resolveStep(s) !== null));
        }
        targetRef.current = el;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
        // Measure after the scroll settles.
        setTimeout(() => { if (!cancelled) { measure(); shownAny.current = true; onStep?.(index, step); } }, reduceMotion ? 0 : 250);
        return;
      }
      if (Date.now() - started > FIND_TIMEOUT_MS) {
        // Not on screen: skip this step, the count adjusts.
        setSteps((s) => s.filter((x) => x.id !== step.id));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, pathname]);

  // Every step dropped, or the last one dropped while on it: done ("none"
  // if not a single step was shown).
  useEffect(() => {
    if (steps.length === 0) onClose(shownAny.current ? "completed" : "none", 0);
    else if (index >= steps.length) onClose(shownAny.current ? "completed" : "none", steps.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  useEffect(() => {
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [rect, confirmSkip, index]);

  // The card takes focus on each step (screen readers announce it).
  useEffect(() => {
    if (rect) cardRef.current?.focus();
  }, [rect, confirmSkip]);

  const next = useCallback(() => {
    if (index >= total - 1) onClose("completed", index);
    else setIndex(index + 1);
  }, [index, total, onClose]);
  const back = useCallback(() => { if (index > 0) setIndex(index - 1); }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setConfirmSkip(true); return; }
      if (confirmSkip) return;
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, confirmSkip]);

  if (!step || typeof document === "undefined") return null;

  const hole = rect && {
    x: rect.left - PAD,
    y: rect.top - PAD,
    w: rect.width + 2 * PAD,
    h: rect.height + 2 * PAD,
  };
  const pos = rect ? cardPosition(rect, cardH) : null;
  const title = tSteps(step.titleKey);
  // The fallback's text when the step's own target isn't on screen.
  const text = !usedFallback
    ? tSteps(step.textKey)
    : usedFallback.menuSection
      ? `${t("inMenu", { section: tNav(usedFallback.menuSection) })}${tSteps(step.textKey)}`
      : tSteps(usedFallback.textKey!);

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-hidden={false}>
      {/* The dimmed screen with the cut-out. It swallows clicks: tapping the
          dim does nothing (no accidental skips). */}
      <svg className="absolute inset-0 h-full w-full" onClick={(e) => e.stopPropagation()}>
        <defs>
          <mask id="tour-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="12" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(15, 23, 42, 0.6)" mask="url(#tour-hole)" />
      </svg>
      {hole && (
        <div
          className={`pointer-events-none absolute rounded-xl ring-2 ring-teal-400 shadow-[0_0_24px_4px_rgba(45,212,191,0.45)] ${
            index === 0 && !reduceMotion ? "animate-pulse" : ""
          } ${reduceMotion ? "" : "transition-all duration-200"}`}
          style={{ top: hole.y, left: hole.x, width: hole.w, height: hole.h }}
        />
      )}

      {pos && (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-text"
          tabIndex={-1}
          className={`absolute rounded-2xl bg-white p-5 shadow-2xl outline-none ${reduceMotion ? "" : "transition-all duration-200"}`}
          style={{ top: pos.top, left: pos.left, width: Math.min(CARD_W, window.innerWidth - 2 * GAP) }}
        >
          {confirmSkip ? (
            <>
              <p id="tour-title" className="text-base font-bold text-slate-900">{t("skipConfirmTitle")}</p>
              <p id="tour-text" className="mt-1 text-sm text-slate-600">{t("skipConfirmText")}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmSkip(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  {t("continueTour")}
                </button>
                <button type="button" onClick={() => onClose("skipped", index)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700">
                  {t("skip")}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Announced as "Step 3 of 8: Title. Text". */}
              <p className="sr-only" aria-live="polite">{t("progress", { n: index + 1, total })}: {title}. {text}</p>
              <p className="text-xs font-semibold text-teal-600">{t("progress", { n: index + 1, total })}</p>
              <p id="tour-title" className="mt-1 text-base font-bold text-slate-900">{title}</p>
              <p id="tour-text" className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              <div className="mt-3 flex items-center gap-1" aria-hidden="true">
                {steps.map((s, i) => (
                  <span key={s.id} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-teal-600" : "w-1.5 bg-slate-200"}`} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setConfirmSkip(true)} className="text-sm font-semibold text-slate-400 hover:text-slate-600">
                  {t("skipTour")}
                </button>
                <div className="flex gap-2">
                  {onTryNow && steps[index]?.id === "solvyai" && (
                    <button type="button" onClick={() => onTryNow(index)} className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">
                      {t("tryNow")}
                    </button>
                  )}
                  {index > 0 && (
                    <button type="button" onClick={back} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      {t("back")}
                    </button>
                  )}
                  <button type="button" onClick={next} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">
                    {index >= total - 1 ? t("finish") : t("next")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>,
    portalRoot(),
  );
}
