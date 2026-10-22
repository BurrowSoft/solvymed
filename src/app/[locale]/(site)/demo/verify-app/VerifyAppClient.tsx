"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DemoTurnstile } from "@/components/DemoTurnstile";

// The widget and one line, nothing else: no session, no analytics (no
// consent banner here, lib/consent TRANSACTIONAL), no cookies of ours.
// The token goes to the app's WebView (window.ReactNativeWebView); from a
// Custom Tab, only to the app's own return link, exactly this one: a token
// is never sent to any other address.
export const APP_RETURN = "solvymed://demo-verify";

type RnWebView = { postMessage: (message: string) => void };

function post(message: Record<string, string>): boolean {
  const rn = (window as unknown as { ReactNativeWebView?: RnWebView }).ReactNativeWebView;
  if (!rn || typeof rn.postMessage !== "function") return false;
  rn.postMessage(JSON.stringify(message));
  return true;
}

export function VerifyAppClient({ siteKey }: { siteKey: string }) {
  const t = useTranslations("demo");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  function onToken(token: string) {
    if (post({ type: "turnstile", token })) return;
    if (new URLSearchParams(location.search).get("return") === APP_RETURN) {
      location.replace(`${APP_RETURN}#token=${encodeURIComponent(token)}`);
    }
  }

  function onError(code: string) {
    setFailed(true);
    if (post({ type: "turnstile-error", code })) return;
    if (new URLSearchParams(location.search).get("return") === APP_RETURN) {
      location.replace(`${APP_RETURN}#error=${encodeURIComponent(code)}`);
    }
  }

  return (
    <main data-testid="demo-verify-app" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
      <p className="text-base font-semibold text-slate-800">{t("verifying")}</p>
      {siteKey ? (
        <DemoTurnstile key={attempt} siteKey={siteKey} locale={locale} onToken={onToken} onError={onError} />
      ) : (
        <span data-testid="demo-verify-unconfigured" hidden />
      )}
      {failed && (
        <button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{t("retry")}</button>
      )}
    </main>
  );
}
