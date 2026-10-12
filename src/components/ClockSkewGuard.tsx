"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isSkewed, measureSkew } from "@/lib/clockSkew";

// The wrong-clock guard (1.9.0 item 1.7; lib/clockSkew). Mounted with the
// offline guard on every signed-in screen. The browser auth client starts
// with its background refresh OFF (lib/supabase/client); this turns it on
// once the device's clock checks out, and keeps it off, with a banner,
// while the clock is more than 5 minutes off. Nothing typed is lost: the
// session stays (the server keeps its own cookies fresh by its own clock),
// and an expired token is still refreshed on demand by the next request.
// Checked on mount, when the tab comes back, and every 10 minutes.

const RECHECK_MS = 10 * 60_000;

export function ClockSkewGuard() {
  const t = useTranslations("clockSkew");
  const [skewed, setSkewed] = useState(false);

  useEffect(() => {
    let alive = true;
    const auth = createClient().auth;
    const check = async () => {
      const skew = await measureSkew();
      if (!alive) return;
      // A failed check counts as a right clock (never block on it).
      const wrong = skew !== null && isSkewed(skew);
      setSkewed(wrong);
      if (wrong) await auth.stopAutoRefresh();
      else await auth.startAutoRefresh();
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!skewed) return null;
  return (
    <div role="alert" data-testid="clock-skew-banner" className="fixed inset-x-0 top-12 z-[60] flex justify-center px-4 print:hidden">
      <p className="max-w-xl rounded-xl bg-[#7c2d12] px-4 py-2 text-center text-sm font-medium text-[#ffffff] shadow-lg">{t("banner")}</p>
    </div>
  );
}
