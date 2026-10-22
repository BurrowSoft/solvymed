"use client";

import { useEffect, useRef } from "react";
import { loadTurnstileScript } from "@/components/TurnstileWidget";
import { DEMO_TURNSTILE_ACTION } from "@/lib/demoTurnstile";

// The demo's bot check on /demo's loading screen (01: managed, shown only
// if Cloudflare needs the visitor to interact; never hiding DEMO or the
// sign-up). One token per mount; a retry mounts it again.
export function DemoTurnstile({ siteKey, locale, onToken, onError }: {
  siteKey: string;
  locale: string;
  onToken: (token: string) => void;
  onError: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action: DEMO_TURNSTILE_ACTION,
          appearance: "interaction-only",
          language: locale,
          callback: (token: string) => cb.current.onToken(token),
          "error-callback": () => cb.current.onError(),
        });
      })
      .catch(() => cb.current.onError());
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, locale]);

  return <div ref={box} data-testid="demo-turnstile" className="flex min-h-0 justify-center" />;
}
