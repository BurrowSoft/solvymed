"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/authErrors";
import { useAuthErrorText } from "@/lib/useAuthErrorText";

// "Or enter the code from the e-mail" on "Confirme seu e-mail" (01's spec,
// PR B; shown only while the shared switch confirm_by_code is on, i.e. the
// e-mail carries the code). The code confirms the sign-up like the link:
// the session is set here, then the server routes as for a clicked link
// (/api/auth/after-verify: role linking, the invite code, the welcome).
// The code is 8 digits (Supabase's mailer_otp_length; the app's field too).
// Shown as 8 cells over one real input (typing, paste and the one-time-code
// autofill), sent on the 8th digit once per code, as the app (#615; the
// funnel contract's (a)): the same 8 digits never go out twice on their own,
// Confirm still retries.
export const CODE_LENGTH = 8;

export function ConfirmByCode({ email, locale }: { email: string; locale: string }) {
  const t = useTranslations("auth.confirmEmail");
  const authErrorText = useAuthErrorText();
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const autoSent = useRef("");

  function onChange(value: string) {
    const next = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(next);
    // Not while a check is in flight (as the app's !verifying): that code stays
    // unmarked, so Confirmar, or the 8th digit typed again, sends it.
    if (next.length === CODE_LENGTH && !working && next !== autoSent.current) {
      autoSent.current = next;
      void send(next);
    }
  }

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    void send(code);
  }

  async function send(token: string) {
    if (working || token.length !== CODE_LENGTH) return;
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (verifyError) {
      setWorking(false);
      // Too many tries or no connection: their usual texts (nothing was
      // checked; b9); any other refusal: invalid or expired.
      const key = authErrorKey(verifyError);
      setError(key === "rateLimited" || key === "network" ? authErrorText(verifyError) ?? t("codeInvalid") : t("codeInvalid"));
      return;
    }
    const res = await fetch("/api/auth/after-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, type: "signup" }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { redirect?: string } | null;
    window.location.assign(json?.redirect ?? (locale === "en" ? "/dashboard" : `/${locale}/dashboard`));
  }

  return (
    <form onSubmit={confirm} data-testid="confirm-by-code" className="mb-4 space-y-2 text-left">
      <label htmlFor="confirm-code" className="field-label">{t("codeLabel")}</label>
      <div className="relative">
        <div aria-hidden="true" data-testid="confirm-code-cells" className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <div
              key={i}
              className={`flex h-12 items-center justify-center rounded-lg border-2 bg-white font-mono text-xl font-bold text-slate-800 ${focused && i === Math.min(code.length, CODE_LENGTH - 1) ? "border-teal-600" : "border-slate-200"}`}
            >
              {code[i] ?? ""}
            </div>
          ))}
        </div>
        <input
          id="confirm-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 h-full w-full cursor-text text-base opacity-0"
        />
      </div>
      <button
        type="submit"
        disabled={working || code.length !== CODE_LENGTH}
        data-testid="confirm-code-submit"
        className="w-full rounded-xl bg-teal-600 px-5 py-3 font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {working ? <span className="spinner-white" aria-hidden="true" /> : t("codeConfirm")}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
