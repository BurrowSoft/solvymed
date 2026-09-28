"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { NewsItem } from "@/lib/news";

// The "Novidades" popup (walkthrough §4a): a centred card (a bottom sheet
// on phones) with one line per new feature (max 3), [See what's new] and
// [Not now]. Esc = Not now. It never does anything by itself.
export function NewsPopup({ items, onSee, onLater }: { items: NewsItem[]; onSee: () => void; onLater: () => void }) {
  const t = useTranslations("news");
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
        aria-labelledby="news-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl" aria-hidden="true">✨</div>
        <h2 id="news-title" className="text-xl font-extrabold text-slate-900">{t("title")}</h2>
        <ul className="mt-4 space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-hidden="true" />
              <div>
                <p className="font-semibold text-slate-900">{t(i.titleKey)}</p>
                <p className="text-sm text-slate-600">{t(i.lineKey)}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLater} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            {t("later")}
          </button>
          <button type="button" onClick={onSee} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
            {t("see")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
