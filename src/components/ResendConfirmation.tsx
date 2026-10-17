"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { signupEmailRedirect } from "@/lib/authEmailRedirect";
import { useAuthErrorText } from "@/lib/useAuthErrorText";
import { authErrorKey } from "@/lib/authErrors";

// "Resend the confirmation e-mail" (01, from real users in 13's logs): a
// sign-in with an unconfirmed address was a dead end. One tap sends the
// sign-up link again (the same link the sign-up sent); then a 60 s wait
// with a countdown (Supabase limits it too: its 429 shows the usual text and
// starts the same wait), and a hint to look in spam. As the app (13).
export const RESEND_COOLDOWN_S = 60;

// neutral (the forgot-password screen, shown to everyone): any outcome but
// the rate limit reads the same, so it never tells whether the address has
// an account or whether it is confirmed (01; account enumeration).
export function ResendConfirmation({ email, locale, captchaToken, neutral = false }: { email: string; locale: string; captchaToken?: string | null; neutral?: boolean }) {
  const t = useTranslations("auth.resendConfirmation");
  const authErrorText = useAuthErrorText();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function resend() {
    if (sending || wait > 0 || !email) return;
    setSending(true);
    setError("");
    const { error: e } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: signupEmailRedirect(locale), ...(captchaToken ? { captchaToken } : {}) },
    });
    setSending(false);
    if (e && !(neutral && authErrorKey(e) !== "rateLimited")) {
      setError(authErrorText(e) ?? "");
      // Supabase's own limit (60 s per address): the same wait (13, the app).
      if (authErrorKey(e) === "rateLimited") setWait(RESEND_COOLDOWN_S);
      return;
    }
    setSent(true);
    setWait(RESEND_COOLDOWN_S);
  }

  return (
    <div data-testid="resend-confirmation" className="mt-3 space-y-2 text-sm">
      <button
        type="button"
        onClick={resend}
        disabled={sending || wait > 0}
        data-testid="resend-confirmation-button"
        className="w-full rounded-xl border border-teal-200 bg-white px-4 py-2.5 font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t("button")}
      </button>
      <p role="status" aria-live="polite" className="text-slate-600">
        {sent ? t(neutral ? "neutralSent" : "sent") : ""}
      </p>
      {wait > 0 && <p data-testid="resend-wait" className="text-slate-500">{t("wait", { seconds: wait })}</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">{t("spamHint")}</p>
    </div>
  );
}
