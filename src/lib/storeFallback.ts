// After a tap that hands off to another app (an intent:// link), the page
// falls back itself if nothing took over: still showing `ms` later → it goes
// to `url` (the https Play listing), once. Chrome follows an intent's
// browser_fallback_url only when the package is missing; a phone whose Play
// Store is disabled or stubbed would otherwise do nothing at all (c6 on #601;
// 09 saw the same for the app's own intent). When the app opens, the page
// hides, leaves or loses focus and the timer is dropped. A new tap replaces
// a pending fallback, so there's never a second navigation.
export const storeNav = { go: (url: string) => window.location.assign(url) };

let pending: (() => void) | null = null;

export function fallBackIfStillVisible(url: string, ms: number, go: (url: string) => void = (u) => storeNav.go(u)): void {
  pending?.();
  const timer = window.setTimeout(() => {
    cleanup();
    if (document.visibilityState === "visible") go(url);
  }, ms);
  const left = () => { if (document.visibilityState === "hidden") { window.clearTimeout(timer); cleanup(); } };
  const gone = () => { window.clearTimeout(timer); cleanup(); };
  function cleanup() {
    document.removeEventListener("visibilitychange", left);
    window.removeEventListener("pagehide", gone);
    // The app's chooser/launch takes focus from the page.
    window.removeEventListener("blur", gone);
    if (pending === gone) pending = null;
  }
  document.addEventListener("visibilitychange", left);
  window.addEventListener("pagehide", gone);
  window.addEventListener("blur", gone);
  pending = gone;
}

// The landing CTA and the demo's chip: 1.5 s (01).
export const STORE_FALLBACK_MS = 1500;
