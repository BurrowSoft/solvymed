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

// No answer at all from the widget (no token, no error, no challenge shown) after this:
// report "stalled", so the app offers to try again instead of waiting (an Android
// WebView that never ran the check; the mobile developer, 10-26).
export const STALL_MS = 15000;

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
  // The return link to the app, once there is something to return (a token or an error).
  const [back, setBack] = useState<string | null>(null);

  // Chrome (the app's Custom Tab) blocks a navigation to solvymed:// that has no user
  // gesture (the mobile developer, 10-26, measured on the emulator): the automatic
  // redirect is still tried, and "Continuar" (01) links to the same address, so a tap
  // takes the person back. A late tap may carry an expired token: the app then offers
  // to try again.
  function returnToApp(fragment: string) {
    if (new URLSearchParams(location.search).get("return") !== APP_RETURN) return;
    const url = `${APP_RETURN}#${fragment}`;
    setBack(url);
    location.replace(url);
  }

  function onToken(token: string) {
    if (post({ type: "turnstile", token })) return;
    returnToApp(`token=${encodeURIComponent(token)}`);
  }

  function onError(code: string) {
    setFailed(true);
    if (post({ type: "turnstile-error", code })) return;
    returnToApp(`error=${encodeURIComponent(code)}`);
  }

  return (
    <main data-testid="demo-verify-app" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
      <p className="text-base font-semibold text-slate-800">{t("verifying")}</p>
      {siteKey ? (
        <DemoTurnstile key={attempt} siteKey={siteKey} locale={locale} onToken={onToken} onError={onError} stallMs={STALL_MS} />
      ) : (
        <span data-testid="demo-verify-unconfigured" hidden />
      )}
      {back && (
        <a href={back} data-testid="demo-verify-back" className="rounded-full bg-[#0D9488] px-5 py-2.5 text-sm font-bold text-white">{t("verifyContinue")}</a>
      )}
      {failed && (
        <button type="button" onClick={() => { setFailed(false); setBack(null); setAttempt((n) => n + 1); }}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{t("retry")}</button>
      )}
    </main>
  );
}
