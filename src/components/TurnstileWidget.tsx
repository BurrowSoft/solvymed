"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY, turnstileEnabled } from "@/lib/turnstile";
import { TURNSTILE_SCRIPT_SRC } from "@/lib/turnstileScript";

// Cloudflare Turnstile (bot protection on sign-up, sign-in and password
// reset). DORMANT unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: without a
// site key nothing renders, no script loads, and the forms send no
// captchaToken. Supabase's own CAPTCHA setting is switched on separately
// (not by web code), together with a mobile min-version bump.
export { turnstileEnabled };

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = TURNSTILE_SCRIPT_SRC;
let scriptPromise: Promise<void> | null = null;

// Shared with the demo's own widget (DemoTurnstile).
export function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error("turnstile_load_failed")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Renders the widget and reports the current token (null when missing or
// expired). Change `resetKey` to get a fresh token: a token is single-use,
// so a form resets it after every submit that reached Supabase.
export function TurnstileWidget({ onToken, locale, resetKey = 0 }: {
  onToken: (token: string | null) => void;
  locale: string;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!turnstileEnabled) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: locale,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [locale]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onTokenRef.current(null);
    }
  }, [resetKey]);

  if (!turnstileEnabled) return null;
  return <div ref={container} className="flex justify-center" />;
}

// Supabase refuses a missing, used or invalid token with a "captcha" error.
export function isCaptchaError(error: { message?: string } | null | undefined): boolean {
  return !!error?.message && /captcha/i.test(error.message);
}
