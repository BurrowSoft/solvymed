"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { browserTimeZone, COUNTRY_STEP, parseCountryChoice, type CountryChoice } from "@/lib/signupCountry";
import { parseGoogleRole, type GoogleRole } from "@/lib/googleSignIn";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legalVersions";
import { signupAttributionMetadata } from "@/lib/signupAttribution";
import { authErrorKey } from "@/lib/authErrors";
import { track } from "@/lib/track";
import { clearAuthCookies } from "@/lib/signOut";

// "Complete your account" (specs/google-sign-in.md; migration 232): a new
// Google account has no role yet (232's marker; the middleware sends its
// dashboard visits here). The person says what they are, as on the sign-up
// form: Profissional de saúde (with the practice's country, which locks after
// this) or Paciente (with the clinic's invite code), checks the name Google
// gave and accepts the Terms and the Privacy Policy. complete_google_signup
// writes what a form sign-up writes; then the same post-sign-up step as an
// e-mail confirmation (/api/auth/after-verify: attribution, routing: the
// professional welcome, or the patient's invite linking and its gate).
// B4 (01, 10-26): the Google account being completed is shown, with "Usar outra
// conta" (signs out → the login), so the wrong account is never a dead end; a
// patient without a code gets "Não tenho código" (how to get in + the same way
// out); a missing field's error sits next to it, scrolled to and focused.
// F3 (242): "Cancelar cadastro" deletes this still-pending sign-in
// (cancel_pending_signup, only ever the caller), after an in-page confirm; then
// sign-out and the landing with "Cadastro cancelado.".
type Field = "country" | "code" | "consent";
const MISS_STATUS = ["invite_not_found", "code_unavailable", "too_many_attempts"];

export default function CompleteAccountPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("auth.completeAccount");
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) ?? "en";
  const localePath = (path: string) => (locale === "en" ? path : `/${locale}${path}`);

  const [role, setRole] = useState<GoogleRole>(parseGoogleRole(searchParams.get("role")) ?? "professional");
  const [country, setCountry] = useState<CountryChoice | null>(parseCountryChoice(searchParams.get("c")));
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  // Activation B4: the opening check failed (no connection, a server error). Before, the
  // button kept spinning with nothing to do; now it says so, with Try again.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [noCode, setNoCode] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: Field; text: string } | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const countryRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  // The error next to its field; the field scrolled into view and focused (F6). After the
  // render: a refused country reopens the picker first, and the focus must land on its
  // first country, not on the "Alterar" button that's going away (cf, #629). A new object
  // per call, so the same error twice focuses again.
  function showFieldError(field: Field, text: string) {
    setFieldError({ field, text });
  }
  useEffect(() => {
    if (!fieldError) return;
    const f = fieldError.field;
    const el = f === "country" ? countryRef.current?.querySelector<HTMLElement>("button") : f === "code" ? codeRef.current : termsRef.current;
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }, [fieldError]);
  const errorFor = (field: Field) => (fieldError?.field === field ? fieldError.text : null);

  // "Usar outra conta": out of this account, to the login (F1/F2).
  async function useAnotherAccount() {
    if (leaving) return;
    setLeaving(true);
    track("complete_account_switch");
    await createClient().auth.signOut().catch(() => null);
    window.location.assign(localePath("/auth/login"));
  }

  // "Cancelar cadastro" (F3, 242): deleted → signed out → the landing's note. Already
  // complete elsewhere → the dashboard (as complete_google_signup's "already done");
  // an invite-code guess in the last hour → try_later (078's limit can't be reset by
  // cancelling and signing up again); anything else → the generic error.
  async function cancelSignup() {
    if (cancelling) return;
    setCancelling(true);
    setCancelError("");
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("cancel_pending_signup");
    if (!rpcError && (data as { status?: string } | null)?.status === "deleted") {
      track("complete_account_cancelled");
      // The user no longer exists: drop only this browser's session (scope "local", no
      // call to Auth for a deleted user) and delete the auth cookies outright, since
      // auth-js can keep the session when its sign-out fails (7e; CloseAccountPanel, cf).
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      clearAuthCookies();
      window.location.assign(localePath("/?signup_cancelled=1"));
      return;
    }
    const m = rpcError?.message ?? "";
    if (["not_pending", "has_account"].some((c) => m.includes(c))) {
      window.location.assign(localePath("/dashboard"));
      return;
    }
    track("complete_account_error", { code: m.includes("try_later") ? "cancel_try_later" : "cancel_failed" });
    setCancelling(false);
    setCancelError(m.includes("try_later") ? tc("cancelTryLater") : authErrorKey(rpcError) === "network" ? t("errors.network") : t("errors.generic"));
  }

  // Only for an account that still has to be completed; anyone else goes on
  // (signed out: the login; done: the dashboard, which routes every role).
  useEffect(() => {
    let live = true;
    const supabase = createClient();
    if (attempt === 0) track("complete_account_view");
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!live) return;
        if (!user) {
          window.location.replace(localePath("/auth/login"));
          return;
        }
        const { data: pending, error: pendingError } = await supabase.rpc("signup_onboarding_is_pending");
        if (!live) return;
        // A failed check isn't "done": sending the person on would leave them without a role.
        if (pendingError) throw pendingError;
        if (pending !== true) {
          window.location.replace(localePath("/dashboard"));
          return;
        }
        setName((n) => n || String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""));
        setEmail(user.email ?? "");
        setLoadFailed(false);
        setReady(true);
      } catch {
        if (!live) return;
        track("complete_account_error", { code: "load_failed" });
        setLoadFailed(true);
      }
    })();
    return () => { live = false; };
    // On mount, and on Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working || !ready) return;
    setError("");
    setFieldError(null);
    if (role === "professional" && !country) {
      showFieldError("country", tc("countryRequired"));
      return;
    }
    if (role === "patient" && !code.trim()) {
      showFieldError("code", t("signup.inviteCodeRequired"));
      return;
    }
    if (!accepted) {
      showFieldError("consent", tc("consentRequired"));
      return;
    }
    setWorking(true);
    const supabase = createClient();
    const { data: result, error: rpcError } = await supabase.rpc("complete_google_signup", {
      p_role: role,
      p_country: role === "professional" ? country : null,
      p_time_zone: browserTimeZone(),
      p_full_name: name.trim(),
      p_invite_code: role === "patient" ? code.trim() : null,
      p_privacy_version: PRIVACY_VERSION,
      p_terms_version: TERMS_VERSION,
      p_locale: locale,
      p_platform: "web",
      // The first-touch campaign, with marketing consent only (as a form sign-up).
      p_signup_attr: signupAttributionMetadata().signup_attr ?? null,
    });
    if (rpcError) {
      const m = rpcError.message ?? "";
      // The account is already complete (another tab, the app): nothing to fix here.
      if (["not_pending", "already_professional", "is_secretary", "patient_linked"].some((c) => m.includes(c))) {
        window.location.assign(localePath("/dashboard"));
        return;
      }
      track("complete_account_error", { code: ["invite_code_required", "unsupported_country", "consent_required"].find((c) => m.includes(c)) ?? (authErrorKey(rpcError) === "network" ? "network" : "other") });
      setWorking(false);
      if (m.includes("invite_code_required")) showFieldError("code", t("signup.inviteCodeRequired"));
      else if (m.includes("unsupported_country")) { setCountry(null); showFieldError("country", tc("countryRequired")); }
      else if (m.includes("consent_required")) showFieldError("consent", tc("consentRequired"));
      else setError(authErrorKey(rpcError) === "network" ? t("errors.network") : t("errors.generic"));
      return;
    }
    // A patient's invite code can miss WITHOUT an error (243: the code is checked and linked
    // in the same call): {status: invite_not_found | code_unavailable | too_many_attempts},
    // nothing completed. Success is status "done" (232, today) or no status; any other
    // status is the generic error, never a silent success (cf: this ships before 243).
    const status = (result as { status?: unknown } | null)?.status;
    if (status !== undefined && status !== null && status !== "done") {
      setWorking(false);
      track("complete_account_error", { code: typeof status === "string" && MISS_STATUS.includes(status) ? status : "unknown_status" });
      if (status === "invite_not_found") showFieldError("code", t("inviteRequired.storedCodeNotFound"));
      else if (status === "code_unavailable") showFieldError("code", t("inviteRequired.codeUnavailable"));
      else if (status === "too_many_attempts") showFieldError("code", t("inviteRequired.tooManyAttempts"));
      else setError(t("errors.generic"));
      return;
    }
    track("signup_complete_submitted", { role });
    // The role is in the session's metadata: refresh, then the same step as
    // after an e-mail confirmation.
    await supabase.auth.refreshSession().catch(() => null);
    const res = await fetch("/api/auth/after-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, type: "signup" }),
    }).catch(() => null);
    const next = res ? ((await res.json().catch(() => ({}))) as { redirect?: string }).redirect : null;
    window.location.assign(next ?? localePath("/dashboard"));
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <BrandMark />
        <div data-testid="complete-account">
          <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{tc("title")}</h1>
          <p className="mb-2 text-center text-sm text-slate-500">{tc("subtitle")}</p>
          {ready && email && (
            <p data-testid="complete-account-line" className="mb-6 break-words text-center text-xs text-slate-500">
              {tc("accountLine", { email })}
              {" · "}
              <button type="button" data-testid="complete-use-another" onClick={useAnotherAccount} disabled={leaving}
                className="font-semibold text-teal-700 underline hover:text-teal-800 disabled:opacity-60">
                {tc("useAnother")}
              </button>
            </p>
          )}
          {!(ready && email) && <div className="mb-4" />}

          <form onSubmit={submit} className="space-y-5" noValidate>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-700">{t("signup.iAmA")}</legend>
              <div className="grid grid-cols-2 gap-3">
                <RoleOption testid="complete-role-professional" selected={role === "professional"} onSelect={() => setRole("professional")}
                  label={t("signup.roleDoctor")} description={t("signup.roleDoctorDesc")} />
                <RoleOption testid="complete-role-patient" selected={role === "patient"} onSelect={() => setRole("patient")}
                  label={t("signup.rolePatient")} description={t("signup.rolePatientViaInvite")} />
              </div>
            </fieldset>

            {role === "professional" && (<div ref={countryRef}>{
              country ? (
                // The practice country locks after this: always in view.
                <p data-testid="complete-country-line" className="text-center text-sm font-semibold text-slate-700">
                  {t(`signup.countryLine.${country}`)}
                  {" · "}
                  <button type="button" data-testid="complete-country-change" onClick={() => setCountry(null)} className="text-teal-700 underline hover:text-teal-800">
                    {t("signup.countryChange")}
                  </button>
                </p>
              ) : (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-700">{tc("countryLabel")}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {COUNTRY_STEP.map((c) => (
                      <button key={c.code} type="button" data-testid={`complete-country-${c.code}`} onClick={() => { setCountry(c.code); setFieldError(null); }}
                        aria-describedby={errorFor("country") ? "complete-error-country" : undefined}
                        className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-500">
                        <span aria-hidden="true">{c.flag}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {errorFor("country") && <p id="complete-error-country" role="alert" data-testid="complete-error-country" className="mt-1.5 text-sm text-red-600">{errorFor("country")}</p>}
                </fieldset>
              )
            }</div>)}

            <div>
              <label htmlFor="complete-name" className="field-label">{t("signup.fullName")}</label>
              <input id="complete-name" data-testid="complete-name" type="text" autoComplete="name" value={name}
                onChange={(e) => setName(e.target.value)} className="text-input" />
            </div>

            {role === "patient" && (
              <div>
                <label htmlFor="complete-invite-code" className="field-label">
                  {t("signup.inviteCode")} <span className="text-red-500">*</span>
                </label>
                <input id="complete-invite-code" ref={codeRef} data-testid="complete-invite-code" type="text" autoCapitalize="characters" value={code}
                  onChange={(e) => { setCode(e.target.value); if (fieldError?.field === "code") setFieldError(null); }}
                  aria-invalid={errorFor("code") ? true : undefined} aria-describedby={errorFor("code") ? "complete-error-code" : undefined}
                  placeholder={t("signup.inviteCodePlaceholder")} className="text-input" />
                {errorFor("code") && <p id="complete-error-code" role="alert" data-testid="complete-error-code" className="mt-1.5 text-sm text-red-600">{errorFor("code")}</p>}
                <p className="mt-1.5 text-xs text-slate-500">{t("signup.inviteCodeHint")}</p>
                <button type="button" data-testid="complete-no-code" aria-expanded={noCode} onClick={() => setNoCode((v) => !v)}
                  className="mt-2 text-sm font-semibold text-teal-700 underline hover:text-teal-800">
                  {tc("noCode")}
                </button>
                {noCode && (
                  <div data-testid="complete-no-code-help" className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    <p>{tc("noCodeText")}</p>
                    <button type="button" data-testid="complete-no-code-use-another" onClick={useAnotherAccount} disabled={leaving}
                      className="mt-2 font-semibold text-teal-700 underline hover:text-teal-800 disabled:opacity-60">
                      {tc("useAnother")}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" ref={termsRef} data-testid="complete-terms" checked={accepted}
                onChange={(e) => { setAccepted(e.target.checked); if (fieldError?.field === "consent") setFieldError(null); }}
                aria-invalid={errorFor("consent") ? true : undefined} aria-describedby={errorFor("consent") ? "complete-error-consent" : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span>
                {t.rich("signup.consentCheckbox", {
                  terms: (chunks) => <Link href={localePath("/terms")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>,
                  privacy: (chunks) => <Link href={localePath("/privacy")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>,
                })}
              </span>
            </label>
            {errorFor("consent") && <p id="complete-error-consent" role="alert" data-testid="complete-error-consent" className="mt-1.5 text-sm text-red-600">{errorFor("consent")}</p>}
            </div>

            {error && <p role="alert" data-testid="complete-error" className="text-sm text-red-600">{error}</p>}

            {loadFailed ? (
              <div role="alert" data-testid="complete-load-failed" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{tc("loadError")}</p>
                <button type="button" data-testid="complete-retry" onClick={() => { setLoadFailed(false); setAttempt((n) => n + 1); }}
                  className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                  {tc("retry")}
                </button>
              </div>
            ) : (
              <button type="submit" data-testid="complete-submit" disabled={working || !ready}
                className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
                {working || !ready ? <><span className="spinner-white" aria-hidden="true" /><span className="sr-only">{tc("working")}</span></> : tc("submit")}
              </button>
            )}
          </form>

          {ready && (
            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm">
              {!cancelAsk ? (
                <button type="button" data-testid="complete-cancel" onClick={() => setCancelAsk(true)}
                  className="font-semibold text-slate-500 underline hover:text-slate-700">
                  {tc("cancelSignup")}
                </button>
              ) : (
                <div role="alertdialog" aria-labelledby="complete-cancel-text" data-testid="complete-cancel-confirm" className="rounded-xl bg-slate-50 p-3 text-left">
                  <p id="complete-cancel-text" className="text-slate-700">{tc("cancelConfirm")}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button type="button" data-testid="complete-cancel-yes" onClick={cancelSignup} disabled={cancelling}
                      className="rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                      {tc("cancelSignup")}
                    </button>
                    <button type="button" data-testid="complete-cancel-back" onClick={() => { setCancelAsk(false); setCancelError(""); }} disabled={cancelling}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                      {tc("cancelBack")}
                    </button>
                  </div>
                  {/* Below the buttons, never above: a line appearing above them moved "Cancelar cadastro"
                      under a tap aimed at "Voltar" (the app's #549 row; 01, cf). */}
                  {cancelError && <p role="alert" data-testid="complete-cancel-error" className="mt-2 text-red-600">{cancelError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}

function RoleOption({ testid, selected, onSelect, label, description }: {
  testid: string; selected: boolean; onSelect: () => void; label: string; description: string;
}) {
  return (
    <button type="button" data-testid={testid} aria-pressed={selected} onClick={onSelect}
      className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-4 text-center transition-all ${
        selected ? "border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}>
      <span className={`text-sm font-bold leading-tight ${selected ? "text-teal-900" : "text-slate-700"}`}>{label}</span>
      <span className={`text-xs leading-snug ${selected ? "text-teal-700" : "text-slate-400"}`}>{description}</span>
    </button>
  );
}
