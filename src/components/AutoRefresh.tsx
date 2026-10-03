"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// Vitor's items 19/21/25/33: lists showed old data until a manual reload.
// The page's server data is fetched again when the tab comes back into view
// (at most every 10 s), every 60 s while it's visible, and on "Atualizar".
// router.refresh() keeps the page's own state (open forms, scroll).
export const REFRESH_EVERY_MS = 60_000;
const MIN_GAP_MS = 10_000;

export function AutoRefresh({ button = true }: { button?: boolean }) {
  const t = useTranslations("autoRefresh");
  const router = useRouter();
  const [pending, start] = useTransition();
  const last = useRef(Date.now());

  const refresh = useCallback(() => {
    last.current = Date.now();
    start(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= MIN_GAP_MS) refresh();
    };
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  if (!button) return null;
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden="true">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 .49-3.58" />
      </svg>
      {t("refresh")}
    </button>
  );
}
