"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { blockedTarget, installOfflineFetchGuard, isOffline } from "@/lib/offline";

// The offline guard's visual layer (specs/offline-guard.md; lib/offline.ts
// has the rules and the fetch layer). Mounted once on every signed-in screen:
// the dashboard, the patient's pages, and the booking page when signed in.
// While the browser says offline:
// - a banner says what's open can be read but changes won't be saved;
// - every form submit and every [data-server] control is stopped before it
//   runs (capture phase, so no handler starts a request), greyed out by the
//   CSS below, and a tap shows the same text as a short message;
// - the form keeps what was typed (nothing is reset).
// Back online: the banner goes, with no extra message.
// Screen readers (01, 10-15): the blocked controls say aria-disabled="true"
// while offline (they stay focusable, so a tap still explains why), and a
// live region that is always on the page announces the message once on
// going offline (a region inserted with its text already in is often missed).

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => !isOffline(), () => true);
}

const CSS = `html[data-offline] [data-server]:not([data-offline-ok]),
html[data-offline] button[type=submit]:not([data-offline-ok]),
html[data-offline] input[type=submit]:not([data-offline-ok]) { opacity: .5; cursor: not-allowed; }`;

export function OfflineGuard() {
  const t = useTranslations("offline");
  const online = useOnline();
  const [nudge, setNudge] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // (a) The fetch layer, for the page's lifetime.
  useEffect(() => installOfflineFetchGuard(process.env.NEXT_PUBLIC_SUPABASE_URL), []);

  // The CSS hook.
  useEffect(() => {
    const root = document.documentElement;
    if (online) delete root.dataset.offline;
    else root.dataset.offline = "1";
    return () => { delete root.dataset.offline; };
  }, [online]);

  // (b) Stop submits and server controls while offline.
  useEffect(() => {
    if (online) return;
    const flash = () => {
      setNudge((n) => n + 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNudge(0), 3500);
    };
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (form?.closest?.("[data-offline-ok]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      flash();
    };
    const onClick = (e: MouseEvent) => {
      const target = blockedTarget(e.target as Element | null);
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      flash();
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [online]);

  // (c) aria-disabled on the blocked controls while offline, those on the
  // page and any that appear meanwhile; back online, only the ones marked
  // here are restored (a control's own aria-disabled is never touched).
  useEffect(() => {
    if (online) return;
    const SEL = "[data-server], button[type=submit], input[type=submit]";
    const mark = (root: ParentNode) => {
      root.querySelectorAll(SEL).forEach((el) => {
        if (blockedTarget(el) !== el || el.hasAttribute("aria-disabled")) return;
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("data-offline-aria", "");
      });
    };
    mark(document);
    const obs = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches(SEL)) mark(n.parentElement ?? document);
        else mark(n);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      document.querySelectorAll("[data-offline-aria]").forEach((el) => {
        el.removeAttribute("aria-disabled");
        el.removeAttribute("data-offline-aria");
      });
    };
  }, [online]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <style>{CSS}</style>
      {/* The announcement: always on the page, its text set on going
          offline, so a screen reader says it once. */}
      <div role="status" aria-live="polite" aria-atomic="true" data-testid="offline-announcer" className="sr-only">
        {online ? "" : t("banner")}
      </div>
      {/* A notice, not a control: clicks pass through to the page header
          under it (7e, #521's clock banner had the same strip). The
          announcer above speaks it, so this one isn't a live region too. */}
      {!online && (
        <div data-testid="offline-banner" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-2 print:hidden">
          <p className={`pointer-events-none max-w-xl rounded-xl bg-[#0f172a] px-4 py-2 text-center text-sm font-medium text-[#ffffff] shadow-lg ${nudge ? "ring-2 ring-amber-400" : ""}`}>
            {t("banner")}
          </p>
          {/* A blocked tap: the same text, announced again (the banner itself
              doesn't change, so a screen reader wouldn't repeat it). */}
          {nudge > 0 && <span key={nudge} role="alert" className="sr-only">{t("banner")}</span>}
        </div>
      )}
    </>
  );
}
