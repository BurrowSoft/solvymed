"use client";

import { useEffect, useRef } from "react";
import { loadTurnstileScript } from "@/components/TurnstileWidget";
import { DEMO_TURNSTILE_ACTION } from "@/lib/demoTurnstile";

// The demo's bot check on /demo's loading screen (01: managed, shown only
// if Cloudflare needs the visitor to interact; never hiding DEMO or the
// sign-up). One token per mount; a retry mounts it again.
// Every way the widget can stop is reported (the app's verify page relies on it; the
// mobile developer, 10-26): Turnstile's timeout and unsupported callbacks, and with
// `stallMs` a stall: no answer at all, while no challenge was asked of the person.
export type DemoTurnstileError = "error" | "expired" | "load_failed" | "timeout" | "unsupported" | "stalled";
export function DemoTurnstile({ siteKey, locale, onToken, onError, stallMs }: {
  siteKey: string;
  locale: string;
  onToken: (token: string) => void;
  onError: (code: DemoTurnstileError) => void;
  stallMs?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    let stall: ReturnType<typeof setTimeout> | null = null;
    const settle = () => { if (stall) clearTimeout(stall); stall = null; };
    if (stallMs) stall = setTimeout(() => { stall = null; if (!cancelled) cb.current.onError("stalled"); }, stallMs);
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action: DEMO_TURNSTILE_ACTION,
          appearance: "interaction-only",
          language: locale,
          callback: (token: string) => { settle(); cb.current.onToken(token); },
          "error-callback": () => { settle(); cb.current.onError("error"); },
          "expired-callback": () => { settle(); cb.current.onError("expired"); },
          "timeout-callback": () => { settle(); cb.current.onError("timeout"); },
          "unsupported-callback": () => { settle(); cb.current.onError("unsupported"); },
          // A challenge is shown: the person may take their time.
          "before-interactive-callback": settle,
        });
      })
      .catch(() => { settle(); cb.current.onError("load_failed"); });
    return () => {
      cancelled = true;
      settle();
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, locale, stallMs]);

  return <div ref={box} data-testid="demo-turnstile" className="flex min-h-0 justify-center" />;
}
