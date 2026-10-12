// The offline guard (specs/offline-guard.md, 1.9.0; Vitor 10-09): with no
// internet, what's open stays readable and anything that needs the server is
// blocked with one message, instead of each screen failing its own way.
//
// Two layers, so the banner's "changes won't be saved" is enforced even on a
// button the visual layer misses:
// (a) this fetch wrapper refuses, before sending, every request that could
//     change something: a non-GET to our own origin (server actions, /api)
//     or to Supabase. It throws a TypeError, like a network failure, so each
//     caller's existing "couldn't …, try again" path runs and typed work stays;
// (b) OfflineGuard (components) blocks form submits and [data-server]
//     buttons with the banner's text, and greys them out.
//
// The browser's online flag is only trusted when it says offline: "online"
// can still mean a dead network, which the per-place error paths handle.

export const OFFLINE_MESSAGE_KEY = "offline.banner";

// The request a wrapper sees: fetch(input, init).
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (typeof input === "object" && !(input instanceof URL) ? input.method : undefined) ?? "GET";
  return m.toUpperCase();
}

// True when a request must not leave the browser while offline (pure; tested).
export function blocksWhenOffline(args: FetchArgs, origin: string, supabaseUrl: string | undefined): boolean {
  const [input, init] = args;
  const method = methodOf(input, init);
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  let url: URL;
  try {
    url = new URL(urlOf(input), origin);
  } catch {
    return false;
  }
  if (url.origin === origin) return true;
  if (supabaseUrl) {
    try {
      // Signing out still clears this browser's session offline.
      if (url.origin === new URL(supabaseUrl).origin) return !url.pathname.endsWith("/auth/v1/logout");
    } catch {
      /* not a URL */
    }
  }
  return false;
}

export class OfflineBlockedError extends TypeError {
  constructor() {
    super("Failed to fetch (offline)");
    this.name = "OfflineBlockedError";
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Installs the wrapper once per page (several guards may mount); returns the
// uninstall for the last one out.
let installs = 0;
let original: typeof fetch | null = null;
export function installOfflineFetchGuard(supabaseUrl: string | undefined): () => void {
  if (typeof window === "undefined") return () => {};
  if (installs++ === 0) {
    original = window.fetch;
    const base = original;
    window.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
      if (isOffline() && blocksWhenOffline([input, init], window.location.origin, supabaseUrl)) {
        return Promise.reject(new OfflineBlockedError());
      }
      return base.call(window, input, init);
    } as typeof fetch;
  }
  return () => {
    if (--installs === 0 && original) {
      window.fetch = original;
      original = null;
    }
  };
}

// The visual layer's targets: every form submit, and the elements marked
// data-server (actions that aren't a form: share, delete, print, export…).
// data-offline-ok opts a client-only control out.
export function blockedTarget(el: Element | null): Element | null {
  const t = el?.closest("[data-server], button[type=submit], input[type=submit]") ?? null;
  if (!t || t.closest("[data-offline-ok]")) return null;
  return t;
}
