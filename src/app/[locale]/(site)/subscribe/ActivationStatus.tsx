"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isSubscriptionActive } from "./actions";

// Back from checkout (/subscribe?success=1): Stripe took the payment, but
// the plan is only on once the webhook writes it. Poll the database every
// 2 s for up to 30 s; say "activated" only when it's really active.
export const POLL_MS = 2000;
export const POLL_LIMIT_MS = 30000;

export function ActivationStatus({ initiallyActive }: { initiallyActive: boolean }) {
  const t = useTranslations("subscription");
  const [state, setState] = useState<"waiting" | "active" | "slow">(initiallyActive ? "active" : "waiting");

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
      <div role="status" className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
        {t("successMessage")}
      </div>
    );
  }
  if (state === "slow") {
    return (
      <div role="status" className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center text-sm text-amber-800">
        {t("activationSlow")}{" "}
        <a href="mailto:support@solvymed.com" className="font-semibold underline">support@solvymed.com</a>
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-green-300 border-t-green-700" aria-hidden="true" />
      {t("activationPending")}
    </div>
  );
}
