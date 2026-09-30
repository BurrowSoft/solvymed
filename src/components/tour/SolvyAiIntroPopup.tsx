"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { portalRoot } from "./portalRoot";

// "Meet SolvyAI ✦" (UX, go-live): a one-time card for doctors when SolvyAI
// first becomes available, like the Novidades popup (a centred card, a
// bottom sheet on phones). [Try it now] opens the panel; [Later] and Esc
// close it for good. It never does anything by itself.
export function SolvyAiIntroPopup({ onTry, onLater }: { onTry: () => void; onLater: () => void }) {
  const t = useTranslations("solvyaiIntro");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 sm:items-center">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="solvyai-intro-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl text-teal-600" aria-hidden="true">✦</div>
        <h2 id="solvyai-intro-title" className="text-xl font-extrabold text-slate-900">{t("title")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("body")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLater} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            {t("later")}
          </button>
          <button type="button" onClick={onTry} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
            {t("tryNow")}
          </button>
        </div>
      </div>
    </div>,
    portalRoot(),
  );
}
