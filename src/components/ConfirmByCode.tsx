"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/authErrors";
import { useAuthErrorText } from "@/lib/useAuthErrorText";

// "Or enter the code from the e-mail" on "Confirme seu e-mail" (01's spec,
// PR B; shown only while the shared switch confirm_by_code is on, i.e. the
// e-mail carries the code). The code confirms the sign-up like the link:
// the session is set here, then the server routes as for a clicked link
// (/api/auth/after-verify: role linking, the invite code, the welcome).
export function ConfirmByCode({ email, locale }: { email: string; locale: string }) {
  const t = useTranslations("auth.confirmEmail");
  const authErrorText = useAuthErrorText();
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (working || code.length < 6) return;
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    if (verifyError) {
      setWorking(false);
      // Too many tries: the usual text; any other refusal: invalid or expired.
      setError(authErrorKey(verifyError) === "rateLimited" ? authErrorText(verifyError) ?? t("codeInvalid") : t("codeInvalid"));
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
      <div className="flex gap-2">
        <input
          id="confirm-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className="text-input font-mono tracking-widest"
        />
        <button
          type="submit"
          disabled={working || code.length < 6}
          data-testid="confirm-code-submit"
          className="shrink-0 rounded-xl bg-teal-600 px-5 py-3 font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {working ? <span className="spinner-white" aria-hidden="true" /> : t("codeConfirm")}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
