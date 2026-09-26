"use client";

import { useTranslations } from "next-intl";
import { iosAppLink, playStoreUrl, type StoreMedium } from "@/lib/appStores";

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6 shrink-0">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6 shrink-0">
      <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
    </svg>
  );
}

const PRIMARY_BASE =
  "flex items-center justify-center gap-3 rounded-xl bg-teal-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-teal-900/40";
const PRIMARY_HOVER = "transition hover:bg-teal-400";
// The Play and Open-app buttons are outlined; their colours depend on the
// background the buttons sit on.
const SECONDARY = {
  dark: "border-2 border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  light: "border-2 border-teal-600 bg-white text-teal-700 hover:bg-teal-50",
} as const;

// medium: the page the buttons sit on, recorded as install attribution.
// tone: "dark" on the landing page's teal hero, "light" on white cards.
// stacked: one button per row at every width (narrow cards).
export function AppDownloadButtons({
  medium = "landing",
  tone = "dark",
  showOpenApp = true,
  stacked = false,
}: {
  medium?: StoreMedium;
  tone?: keyof typeof SECONDARY;
  showOpenApp?: boolean;
  stacked?: boolean;
}) {
  const t = useTranslations("hero");
  const ios = iosAppLink(medium);
  // Full width on phones; side by side from sm up unless stacked.
  const width = stacked ? "w-full" : "w-full sm:w-auto";
  const primary = `${PRIMARY_BASE} ${PRIMARY_HOVER} ${width}`;
  const secondary = `flex items-center justify-center gap-3 rounded-xl px-8 py-4 text-lg font-bold transition ${width} ${SECONDARY[tone]}`;

  function openApp() {
    window.location.href = "solvymed://";
  }

  return (
    <div className={`flex flex-col items-center gap-4 ${stacked ? "" : "sm:flex-row sm:justify-center"}`}>
      {/* iOS, driven by NEXT_PUBLIC_IOS_APP_URL (see lib/appStores.ts):
          unset = coming soon, TestFlight link = beta, App Store link = store.
          Beta mode deliberately uses a plain text button: Apple's
          "Download on the App Store" badge isn't allowed for TestFlight. */}
      {ios.mode === "soon" && (
        // Not a link: nothing to activate yet. Its visible text (label plus
        // "Soon" badge) is its accessible name; the title is a tooltip.
        <div
          role="group"
          aria-disabled="true"
          title={t("appStoreComingSoon")}
          className={`relative ${PRIMARY_BASE} ${width} cursor-not-allowed select-none opacity-75`}
        >
          <AppleIcon />
          {t("appStore")}
          <span className="absolute -top-2.5 -right-2.5 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-900 shadow-sm whitespace-nowrap">
            {t("soon")}
          </span>
        </div>
      )}
      {ios.mode === "beta" && (
        <a href={ios.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center justify-center rounded-xl bg-teal-500 px-8 py-3 text-lg font-bold text-white shadow-xl shadow-teal-900/40 ${PRIMARY_HOVER} ${width}`}>
          <span className="flex items-center gap-3">
            <AppleIcon />
            {t("iosBeta")}
          </span>
          <span className="mt-0.5 text-xs font-medium text-teal-50">{t("iosBetaHint")}</span>
        </a>
      )}
      {ios.mode === "store" && (
        <a href={ios.url} target="_blank" rel="noopener noreferrer" className={primary}>
          <AppleIcon />
          {t("appStore")}
        </a>
      )}

      {/* Android: the Play listing (auto-updates), never a sideloaded build */}
      <a href={playStoreUrl(medium)} target="_blank" rel="noopener noreferrer" className={secondary}>
        <PlayIcon />
        {t("googlePlay")}
      </a>

      {showOpenApp && (
        <button type="button" onClick={openApp} className={secondary}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6 shrink-0">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
            <line x1="6" y1="1" x2="6" y2="4" />
            <line x1="10" y1="1" x2="10" y2="4" />
            <line x1="14" y1="1" x2="14" y2="4" />
          </svg>
          {t("openApp")}
        </button>
      )}
    </div>
  );
}
