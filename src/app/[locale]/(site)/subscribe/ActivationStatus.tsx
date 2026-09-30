"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { isSubscriptionActive } from "./actions";

// Back from checkout (/subscribe?success=1): Stripe took the payment, but
// the plan is only on once the webhook writes it. Poll the database every
// 2 s for up to 30 s; say "activated" only when it's really active.
export const POLL_MS = 2000;
export const POLL_LIMIT_MS = 30000;
// Once active, the dashboard opens by itself after this (the button stays).
export const REDIRECT_MS = 3000;

// dashboardHref: the way out (Vitor, live test: the page had none).
// canGoBack: the dashboard lets them in right now (a trial still running).
// An ended trial waiting for the webhook would bounce back to the paywall
// (and its Assinar) from there, so it gets no back link (9a).
export function ActivationStatus({ initiallyActive, dashboardHref, canGoBack = false }: { initiallyActive: boolean; dashboardHref: string; canGoBack?: boolean }) {
  const t = useTranslations("subscription");
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "active" | "slow">(initiallyActive ? "active" : "waiting");

  useEffect(() => {
    if (state !== "active") return;
    const timer = setTimeout(() => router.push(dashboardHref), REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [state, router, dashboardHref]);

  useEffect(() => {
    if (state !== "waiting") return;
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let active = false;
      try { active = await isSubscriptionActive(); } catch { /* keep waiting */ }
      if (stopped) return;
      if (active) { setState("active"); return; }
      if (Date.now() - started + POLL_MS > POLL_LIMIT_MS) { setState("slow"); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [state]);

  if (state === "active") {
    return (
      <div className="mb-6 flex flex-col items-center gap-4">
        <div role="status" className="w-full rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
          {t("successMessage")}
        </div>
        <a href={dashboardHref} className="w-full rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-teal-700 transition">{t("goToDashboard")}</a>
      </div>
    );
  }
  const back = canGoBack ? <a href={dashboardHref} className="mt-2 block text-center text-sm font-semibold text-teal-700 underline">{t("backToDashboard")}</a> : null;
  if (state === "slow") {
    return (
      <div role="status" className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center text-sm text-amber-800">
        {t("activationSlow")}{" "}
        <a href="mailto:support@solvymed.com" className="font-semibold underline">support@solvymed.com</a>
        {back}
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-green-300 border-t-green-700" aria-hidden="true" />
      <span>{t("activationPending")}{back}</span>
    </div>
  );
}
