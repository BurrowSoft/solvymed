"use client";

import { useEffect, useState } from "react";
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

// "Complete your account" (specs/google-sign-in.md; migration 232): a new
// Google account has no role yet (232's marker; the middleware sends its
// dashboard visits here). The person says what they are, as on the sign-up
// form: Profissional de saúde (with the practice's country, which locks after
// this) or Paciente (with the clinic's invite code), checks the name Google
// gave and accepts the Terms and the Privacy Policy. complete_google_signup
// writes what a form sign-up writes; then the same post-sign-up step as an
// e-mail confirmation (/api/auth/after-verify: attribution, routing: the
// professional welcome, or the patient's invite linking and its gate).
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

  // Only for an account that still has to be completed; anyone else goes on
  // (signed out: the login; done: the dashboard, which routes every role).
  useEffect(() => {
    let live = true;
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      if (!user) {
        window.location.replace(localePath("/auth/login"));
        return;
      }
      const { data: pending } = await supabase.rpc("signup_onboarding_is_pending");
      if (!live) return;
      if (pending !== true) {
        window.location.replace(localePath("/dashboard"));
        return;
      }
      setName((n) => n || String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""));
      setReady(true);
    })();
    return () => { live = false; };
    // On mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working || !ready) return;
    setError("");
    if (role === "professional" && !country) {
      setError(tc("countryRequired"));
      return;
    }
    if (role === "patient" && !code.trim()) {
      setError(t("signup.inviteCodeRequired"));
      return;
    }
    if (!accepted) {
      setError(tc("consentRequired"));
      return;
    }
    setWorking(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("complete_google_signup", {
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
      setWorking(false);
      setError(
        m.includes("invite_code_required") ? t("signup.inviteCodeRequired")
          : m.includes("unsupported_country") ? tc("countryRequired")
          : m.includes("consent_required") ? tc("consentRequired")
          : authErrorKey(rpcError) === "network" ? t("errors.network")
          : t("errors.generic"),
      );
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
          <p className="mb-6 text-center text-sm text-slate-500">{tc("subtitle")}</p>

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

            {role === "professional" && (
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
                      <button key={c.code} type="button" data-testid={`complete-country-${c.code}`} onClick={() => setCountry(c.code)}
                        className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-500">
                        <span aria-hidden="true">{c.flag}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )
            )}

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
                <input id="complete-invite-code" data-testid="complete-invite-code" type="text" autoCapitalize="characters" value={code}
                  onChange={(e) => setCode(e.target.value)} placeholder={t("signup.inviteCodePlaceholder")} className="text-input" />
                <p className="mt-1.5 text-xs text-slate-500">{t("signup.inviteCodeHint")}</p>
              </div>
            )}

            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" data-testid="complete-terms" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span>
                {t.rich("signup.consentCheckbox", {
                  terms: (chunks) => <Link href={localePath("/terms")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>,
                  privacy: (chunks) => <Link href={localePath("/privacy")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>,
                })}
              </span>
            </label>

            {error && <p role="alert" data-testid="complete-error" className="text-sm text-red-600">{error}</p>}

            <button type="submit" data-testid="complete-submit" disabled={working || !ready}
              className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
              {working || !ready ? <span className="spinner-white" aria-hidden="true" /> : tc("submit")}
            </button>
          </form>
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
