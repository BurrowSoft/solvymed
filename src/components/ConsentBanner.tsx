"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { isTransactionalPath, type Consent } from "@/lib/consent";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_S,
  captureAttribution,
  serializeAttribution,
  type Attribution,
} from "@/lib/attribution";
import { OPEN_EVENT, currentConsent, readCookie, saveConsent, useConsent, writeCookie } from "@/lib/consentClient";
import { track } from "@/lib/track";

// The landing page's attribution, held in memory only (nothing is stored
// before consent) so a visitor who accepts marketing on a later page still
// gets the UTM values and referrer of the page they arrived on.
let landing: Attribution | null = null;

// Same style for every choice: no emphasis nudging towards "Accept all".
// On phones, Accept and Decline share one row at the same size.
const BUTTON =
  "rounded-xl border border-teal-600 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 sm:px-4";
const CHOOSE_LINK = "font-semibold text-teal-700 underline hover:text-teal-800";

// LGPD cookie banner. Shown until the visitor answers (and again after 12
// months or a consent-version change), except on transactional pages;
// "Cookie settings" links reopen it. Also runs what consent allows:
// attribution capture (marketing) and page views (analytics).
export function ConsentBanner() {
  const t = useTranslations("consent");
  const pathname = usePathname();
  const { ready, consent } = useConsent();
  const [reopened, setReopened] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<Consent>({ analytics: false, marketing: false });
  const firstControl = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    landing ??= captureAttribution({
      search: location.search,
      referrer: document.referrer,
      pathname: location.pathname,
      ownHost: location.hostname,
    });
  }, []);

  useEffect(() => {
    const open = () => {
      setChoice(consentOrNone());
      setChoosing(true);
      setReopened(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (reopened) firstControl.current?.focus();
  }, [reopened]);

  // First touch: written once, only with marketing consent. Any existing
  // value (including the "sent" marker after a signup) is kept.
  useEffect(() => {
    if (consent?.marketing && landing && !readCookie(ATTRIBUTION_COOKIE)) {
      writeCookie(ATTRIBUTION_COOKIE, serializeAttribution(landing), ATTRIBUTION_MAX_AGE_S);
    }
  }, [consent?.marketing]);

  useEffect(() => {
    if (consent?.analytics) track("$pageview");
  }, [consent?.analytics, pathname]);

  const unanswered = ready && !consent && !isTransactionalPath(pathname, routing.locales);
  const shown = reopened || unanswered;

  // The page gets bottom padding as tall as the banner, so every control
  // (the sign-up's country buttons, its form) can scroll above it, and
  // --consent-h so the auth pages centre above it (AuthPageShell). Nothing
  // renders before hydration (ready is false on the server), so the
  // pre-hydration page is never covered.
  useEffect(() => {
    const el = bar.current;
    if (!shown || !el) return;
    const body = document.body;
    const root = document.documentElement;
    const before = body.style.paddingBottom;
    const fit = () => {
      body.style.paddingBottom = `${el.offsetHeight}px`;
      root.style.setProperty("--consent-h", `${el.offsetHeight}px`);
    };
    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      body.style.paddingBottom = before;
      root.style.removeProperty("--consent-h");
    };
  }, [shown]);

  if (!shown) return null;

  function decide(next: Consent) {
    saveConsent(next);
    setReopened(false);
    setChoosing(false);
  }

  return (
    <div ref={bar} data-testid="consent-banner" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-2 sm:p-6">
      <section
        aria-label={t("title")}
        className="pointer-events-auto mx-auto max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-xl sm:p-5"
      >
        {/* Phones: one short sentence, so the bar stays under ~30% of the
            screen (the long one covered the sign-up's buttons on an
            iPhone SE). Same choices, same consent. */}
        <p className="text-sm leading-snug sm:leading-relaxed">
          <span className="sm:hidden">{t("textShort")}</span>
          <span className="hidden sm:inline">{t("text")}</span>{" "}
          <Link href="/privacy" className={CHOOSE_LINK}>
            {t("privacyLink")}
          </Link>
          {!choosing && (
            <span className="sm:hidden">
              {" · "}
              <button type="button" className={CHOOSE_LINK} onClick={() => { setChoice(consentOrNone()); setChoosing(true); }}>
                {t("choose")}
              </button>
            </span>
          )}
        </p>

        {choosing && (
          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">{t("title")}</legend>
            <Category title={t("necessaryTitle")} description={t("necessaryDesc")} checked disabled />
            <Category
              ref={firstControl}
              title={t("analyticsTitle")}
              description={t("analyticsDesc")}
              checked={choice.analytics}
              onChange={(v) => setChoice((c) => ({ ...c, analytics: v }))}
            />
            <Category
              title={t("marketingTitle")}
              description={t("marketingDesc")}
              checked={choice.marketing}
              onChange={(v) => setChoice((c) => ({ ...c, marketing: v }))}
            />
          </fieldset>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
          <button type="button" className={BUTTON} onClick={() => decide({ analytics: true, marketing: true })}>
            <span className="sm:hidden">{t("acceptShort")}</span>
            <span className="hidden sm:inline">{t("acceptAll")}</span>
          </button>
          <button type="button" className={BUTTON} onClick={() => decide({ analytics: false, marketing: false })}>
            <span className="sm:hidden">{t("declineShort")}</span>
            <span className="hidden sm:inline">{t("necessaryOnly")}</span>
          </button>
          {choosing ? (
            <button type="button" className={`${BUTTON} col-span-2`} onClick={() => decide(choice)}>
              {t("save")}
            </button>
          ) : (
            <button type="button" className={`${BUTTON} hidden sm:inline-block`} onClick={() => { setChoice(consentOrNone()); setChoosing(true); }}>
              {t("choose")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// Read from the cookie, not render state: the "Cookie settings" listener is
// registered once.
function consentOrNone(): Consent {
  return currentConsent() ?? { analytics: false, marketing: false };
}

function Category({
  ref,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  ref?: React.Ref<HTMLInputElement>;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className={`flex gap-3 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
      <input
        ref={ref}
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-teal-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-semibold text-slate-900">{title}</span>
        <span className="block text-slate-500">{description}</span>
      </span>
    </label>
  );
}
