"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { appOpenUrl, playStoreUrl } from "@/lib/appStores";

// "Abrir no app SolvyMed" (Vitor: an email's button opened the website inside
// Gmail's browser, which ignores App Links). On an Android phone only: it
// opens the app if it's installed, else its Play page; "Continuar no site"
// just hides it. iOS has no App Store build yet, so nothing is offered there.
// onlyWithParam: shown only when the URL carries ?app=1 (the secretary's
// first dashboard after confirming).
// onShown: told when the buttons are up (patient-welcome holds its countdown).
// Chrome doesn't always follow the intent's browser_fallback_url when the app
// isn't installed (09, Chrome 133: the tap did nothing). So the page falls
// back itself: if it's still showing a moment after the tap, nothing took
// over, and it goes to the Play listing. When the app (or Chrome's own
// fallback) opens, the page hides and the timer is dropped.
export const PLAY_FALLBACK_MS = 2000;
export const openInAppNav = { go: (url: string) => window.location.assign(url) };

export function OpenInApp({ onlyWithParam = false, onShown }: { onlyWithParam?: boolean; onShown?: (shown: boolean) => void }) {
  const t = useTranslations("openInApp");
  const [show, setShow] = useState(false);

  // Read in the browser (no useSearchParams: no Suspense needed anywhere).
  useEffect(() => {
    if (onlyWithParam && new URLSearchParams(window.location.search).get("app") !== "1") return;
    const android = /Android/i.test(navigator.userAgent);
    const phone = window.matchMedia?.("(max-width: 767px)").matches ?? false;
    setShow(android && phone);
  }, [onlyWithParam]);
  useEffect(() => { onShown?.(show); }, [show, onShown]);

  function fallBackToPlay() {
    const timer = window.setTimeout(() => {
      cleanup();
      if (document.visibilityState === "visible") openInAppNav.go(playStoreUrl("invite"));
    }, PLAY_FALLBACK_MS);
    const left = () => { if (document.visibilityState === "hidden") { window.clearTimeout(timer); cleanup(); } };
    const gone = () => { window.clearTimeout(timer); cleanup(); };
    function cleanup() {
      document.removeEventListener("visibilitychange", left);
      window.removeEventListener("pagehide", gone);
      window.removeEventListener("blur", gone);
    }
    document.addEventListener("visibilitychange", left);
    window.addEventListener("pagehide", gone);
    // The app's chooser/launch takes focus from the page.
    window.addEventListener("blur", gone);
  }

  if (!show) return null;
  return (
    <div data-testid="open-in-app" className="mb-6 flex flex-col gap-2">
      <a
        href={appOpenUrl()}
        onClick={fallBackToPlay}
        className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95"
      >
        {t("open")}
      </a>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="w-full rounded-xl px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        {t("continue")}
      </button>
    </div>
  );
}
