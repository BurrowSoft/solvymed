"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { currentTeamAccess } from "@/app/[locale]/(site)/dashboard/access-actions";

// A secretary's open dashboard notices when a doctor removes her (or she
// joins another team): on coming back to the tab (at most every 10 s) and
// every 2 minutes while it's visible, like the app (mobile #401). A change
// re-renders the dashboard, whose layout and middleware then move her to her
// next practice or to "not part of any team". Nothing else is reloaded.
export function TeamAccessWatch({ initial }: { initial: string | null }) {
  const router = useRouter();
  const known = useRef(initial);
  useEffect(() => {
    let last = Date.now();
    let busy = false;
    const check = async (force: boolean) => {
      if (document.visibilityState !== "visible" || busy) return;
      if (!force && Date.now() - last < 10_000) return;
      last = Date.now();
      busy = true;
      try {
        const now = await currentTeamAccess();
        if (now === null) return;
        if (known.current === null) { known.current = now; return; }
        if (now !== known.current) {
          known.current = now;
          router.refresh();
        }
      } catch {
        // Offline or a failed action: try again next time.
      } finally {
        busy = false;
      }
    };
    const onBack = () => void check(false);
    const id = setInterval(() => void check(true), 120_000);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [router]);
  return null;
}
