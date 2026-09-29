"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { TurnstileWidget, turnstileEnabled } from "@/components/TurnstileWidget";
import { useAuthErrorText } from "@/lib/useAuthErrorText";

// Alterar senha while signed in (Help K2; the app's ChangePasswordModal):
// the current password is checked by signing in with it, then the new one
// is saved and, for security, the sessions on other devices are ended
// (this browser stays signed in).
export function ChangePasswordPanel({ email, locale }: { email: string; locale: string }) {
  const t = useTranslations("changePassword");
  const authErrorText = useAuthErrorText();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  function reset() {
    setCurrent(""); setNext(""); setConfirm(""); setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!current || !next || !confirm) { setError(t("allFields")); return; }
    if (next !== confirm) { setError(t("mismatch")); return; }
    if (next.length < MIN_PASSWORD_LENGTH) { setError(t("tooShort", { min: MIN_PASSWORD_LENGTH })); return; }
    if (next === current) { setError(t("sameError")); return; }
    if (turnstileEnabled && !captchaToken) { setError(t("generic")); return; }
    setPending(true);
    try {
      const supabase = createClient();
      // A failed sign-in here means the current password is wrong.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email, password: current, options: captchaToken ? { captchaToken } : undefined,
      });
      if (turnstileEnabled) setCaptchaReset((n) => n + 1);
      if (authError) {
        setError(authError.code === "invalid_credentials" ? t("currentWrong") : authErrorText(authError) ?? t("generic"));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) { setError(authErrorText(updateError) ?? t("generic")); return; }
      // Best effort: the password is already changed.
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      reset();
      setDone(true);
    } catch {
      setError(t("generic"));
    } finally {
      setPending(false);
    }
  }

  const field = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("hint")}</p>
        </div>
        {!open && (
          <button type="button" onClick={() => { reset(); setDone(false); setOpen(true); }} className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t("title")}
          </button>
        )}
      </div>
      {done && <p role="status" className="mt-3 text-sm font-semibold text-green-700">{t("success")}</p>}
      {open && !done && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
          <label className="block text-sm font-semibold text-slate-700">{t("current")}
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">{t("new")}
            <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={next} onChange={(e) => setNext(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">{t("confirm")}
            <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <TurnstileWidget onToken={setCaptchaToken} locale={locale} resetKey={captchaReset} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { reset(); setOpen(false); }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
              {pending ? t("saving") : t("title")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
