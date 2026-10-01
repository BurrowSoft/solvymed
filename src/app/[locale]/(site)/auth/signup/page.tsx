"use client";

import { useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";
import { isWellFormedSecretaryCode, normalizeSecretaryCode } from "@/lib/secretary";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { TurnstileWidget, turnstileEnabled } from "@/components/TurnstileWidget";
import { useAuthErrorText } from "@/lib/useAuthErrorText";
import { track } from "@/lib/track";
import { browserTimeZone, COUNTRY_STEP, countryStepHref, parseCountryChoice, signupCountryMetadata } from "@/lib/signupCountry";
import { thaiEnabled } from "@/lib/publicLocales";
import { consentMetadata } from "@/lib/legalVersions";
import { titleExamples } from "@/lib/country";

type Role = "professional" | "secretary" | "patient";

export default function SignupPage() {
  const t = useTranslations("auth");
  const authErrorText = useAuthErrorText();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) ?? "en";

  // /join/[code] redirects unauthenticated visitors here with the doctor's
  // public invite code — treated exactly like a manually-typed code (same
  // metadata field, same linking RPCs downstream), just pre-filled and with
  // the role locked to patient instead of picked.
  const joinCode = (searchParams.get("join") ?? "").toUpperCase();
  const isJoinFlow = !!joinCode;

  // Secretaries can only sign up through a doctor's invite:
  // /join/secretary/<code> sends signed-out invitees here with the code, and
  // the role is locked to secretary. The email is typed, never taken from
  // the URL (older links carried ?email=, now ignored); before signing up
  // it's checked against the invite, and the server matches it again on
  // accept, which is the real boundary.
  // A malformed ?secretary= can't be a real invite, so it doesn't start a
  // secretary signup (that would only create an unlinked account).
  const rawSecretaryCode = isJoinFlow ? "" : normalizeSecretaryCode(searchParams.get("secretary") ?? "");
  const secretaryCode = isWellFormedSecretaryCode(rawSecretaryCode) ? rawSecretaryCode : "";
  const isSecretaryFlow = !!secretaryCode;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>(isJoinFlow ? "patient" : isSecretaryFlow ? "secretary" : "professional");
  const [inviteCode, setInviteCode] = useState(joinCode);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  // One submit at a time (a double-click lands before the disabled re-render).
  const submitting = useRef(false);
  // Bot protection (dormant until a Turnstile site key is configured).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  // Country first (Vitor, 2026-10-01): the signup starts with "Where are
  // you?" (Brasil / ประเทศไทย + "Use SolvyMed in English"); the choice comes
  // back as ?c= in the chosen language, and it's the practice country
  // (it locks after signup). Invite and join-link signups already belong to a
  // practice, so they skip it. Before the Thai release there's no step (every
  // practice is Brazilian, the database default).
  const router = useRouter();
  const country = parseCountryChoice(searchParams.get("c"));
  const countryStep = thaiEnabled && !isSecretaryFlow && !isJoinFlow;
  const [english, setEnglish] = useState(locale === "en");
  const goTo = (href: string, newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; samesite=lax`;
    router.push(href);
  };
  // The title examples follow the country picked, live (UX): the registry's,
  // or the locale's own list without one (the unknown "ZZ", never Brazil).
  const tSettings = useTranslations("settings");
  const signupTitles = titleExamples(country ?? "ZZ", locale) ?? tSettings("fullNameTitles");

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    if (role === "patient" && !inviteCode.trim()) {
      setError(t("signup.inviteCodeRequired"));
      return;
    }

    if (turnstileEnabled && !captchaToken) {
      setError(t("captchaFailed"));
      return;
    }

    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    const supabase = createClient();

    // Catch a wrong email before the account exists, not after the
    // confirmation email when accepting fails. BROWSER ONLY (see migration
    // 093's header): the RPC is rate-limited per client IP. `false` also
    // means the invite is no longer open (this page is reachable directly,
    // e.g. from a bookmark), so the message covers both. Any error,
    // too_many_attempts included, lets signup go ahead: the accept-time
    // email check is the real boundary.
    if (isSecretaryFlow) {
      const { data: matches, error: matchError } = await supabase.rpc("secretary_invite_email_matches", {
        p_code: secretaryCode,
        p_email: email,
      });
      if (!matchError && matches === false) {
        submitting.current = false;
        setLoading(false);
        setError(t("signup.secretaryEmailMismatch"));
        return;
      }
    }

    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          platform: "web",
          // The language auth emails link back in (the template passes it to
          // /api/auth/callback). Language only; never used for access.
          locale,
          // The Terms and Privacy Policy versions accepted with the required
          // checkbox (recorded by handle_new_user, migration 111; ignored
          // before it).
          ...consentMetadata(),
          // The practice country and the browser's time zone (doctors):
          // handle_new_user stores them (migration 110; ignored before it).
          // Nothing before the Thai release (the database default, BR).
          ...(role === "professional"
            ? signupCountryMetadata(country ?? "BR", browserTimeZone())
            : {}),
          ...(role === "patient" && inviteCode.trim()
            ? { invite_code: inviteCode.toUpperCase().trim() }
            : {}),
          // Accepted server-side after email confirmation
          // (accept_secretary_invite, with the new user's own session).
          ...(role === "secretary" && isSecretaryFlow
            ? { secretary_invite_code: secretaryCode }
            : {}),
        },
        // The callback has no [locale] segment; this lands the user on the
        // page in the language they signed up in.
        emailRedirectTo: `https://www.solvymed.com/api/auth/callback?locale=${encodeURIComponent(locale)}`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    submitting.current = false;
    setLoading(false);
    if (turnstileEnabled) setCaptchaReset((n) => n + 1);

    if (authError) {
      setError(authErrorText(authError) ?? t("errors.generic"));
    } else if (signUpData.user?.identities?.length === 0) {
      // Supabase returns an empty identities array (no error) when the email is
      // already registered — avoid leaking "email exists" by pointing to login.
      setError(t("signup.emailExists"));
    } else {
      track("signup_submitted", { role });
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <Logo />
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">{t("signup.success")}</h1>
          <p className="mb-8 text-slate-500">{t("signup.successSub")}</p>
          <Link href={localePath("/")} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 transition-colors">
            {t("backToHome")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  const backArrow = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
  // "Use SolvyMed in English": always in English (spec), on the country step
  // and on the invite / join-link signups, which skip it.
  const englishBox = (onChange: (checked: boolean) => void) => (
    <label className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-600">
      <input type="checkbox" checked={english} onChange={(e) => { setEnglish(e.target.checked); onChange(e.target.checked); }} className="h-4 w-4 accent-teal-600" />
      Use SolvyMed in English
    </label>
  );

  // Step 1: "Where are you?", trilingual, with nothing else (spec).
  if (countryStep && !country) {
    return (
      <AuthPageShell>
        <AuthCard>
          <div className="mb-6">
            <Link href={localePath("/")} className="back-link">
              {backArrow}
              {t("backToHome")}
            </Link>
          </div>
          <BrandMark />
          <h1 className="mb-6 text-center text-lg font-bold text-slate-900">Onde você está? · คุณอยู่ที่ไหน? · Where are you?</h1>
          <div className="grid gap-3">
            {COUNTRY_STEP.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  const next = english ? "en" : c.locale;
                  goTo(countryStepHref(c.code, next, searchParams), next);
                }}
                className="flex items-center justify-center gap-3 rounded-2xl border-2 border-teal-200 bg-white px-6 py-5 text-xl font-bold text-slate-900 transition hover:border-teal-500 hover:bg-teal-50"
              >
                <span aria-hidden="true">{c.flag}</span>
                {c.label}
              </button>
            ))}
          </div>
          {englishBox(() => {})}
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard>
        {/* Back: to the country step when there is one (the country locks
            after signup), else home. Browser Back does the same. */}
        <div className="mb-6">
          {countryStep ? (
            <Link href={countryStepHref(null, locale, searchParams)} className="back-link" aria-label={t("signup.backToCountry")}>
              {backArrow}
              {t("signup.backToCountry")}
            </Link>
          ) : (
            <Link href={localePath("/")} className="back-link">
              {backArrow}
              {t("backToHome")}
            </Link>
          )}
        </div>

        <BrandMark />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{t("signup.title")}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">{t("signup.subtitle")}</p>

        {/* Invite / join-link signups: the practice's country, so only the
            English switch (back to the language the link opened in). */}
        {thaiEnabled && !countryStep && (
          <div className="-mt-3 mb-6">
            {englishBox((checked) => {
              const q = new URLSearchParams(searchParams.toString());
              const back = q.get("from") ?? "pt-BR";
              if (checked) q.set("from", locale);
              else q.delete("from");
              const next = checked ? "en" : back;
              const qs = q.toString();
              goTo(`${next === "en" ? "" : `/${next}`}/auth/signup${qs ? `?${qs}` : ""}`, next);
            })}
          </div>
        )}

        {/* Role picker — hidden when joining via invite link */}
        {isJoinFlow ? (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm text-teal-700">
            {t("signup.joiningAs", { role: t("signup.rolePatient") })}
          </div>
        ) : isSecretaryFlow ? (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm text-teal-700">
            {t("signup.joiningAsSecretary")}
          </div>
        ) : (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-slate-700">{t("signup.iAmA")}</p>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard
              selected={role === "professional"}
              onSelect={() => setRole("professional")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              }
              label={t("signup.roleDoctor")}
              description={t("signup.roleDoctorDesc")}
            />
            <RoleCard
              selected={role === "patient"}
              onSelect={() => setRole("patient")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              }
              label={t("signup.rolePatient")}
              description={t("signup.rolePatientDesc")}
            />
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">{t("signup.secretaryNeedsInvite")}</p>
        </div>
        )}

        {/* Invite code — patients only, hidden when joining via link */}
        {!isJoinFlow && role === "patient" && (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
            <label htmlFor="signup-invite-code" className="block text-sm font-semibold text-slate-700 mb-1">
              {t("signup.inviteCode")} <span className="text-red-500">*</span>
            </label>
            <input
              id="signup-invite-code"
              type="text"
              // Not `required`: the browser's bubble would pre-empt the
              // translated signup.inviteCodeRequired that handleSubmit shows.
              aria-required="true"
              form="signup-form"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder={t("signup.inviteCodePlaceholder")}
              maxLength={6}
              className="w-full rounded-xl border border-teal-200 bg-white px-4 py-3 text-base font-mono tracking-widest uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <p className="mt-1.5 text-xs text-slate-500">{t("signup.inviteCodeHint")}</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form id="signup-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">{t("signup.fullName")}</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className="text-input"
            />
            {/* Doctors: a title is never added for them (lib/doctorName); they may type one. */}
            {role === "professional" && !isSecretaryFlow && !isJoinFlow && (
              <p className="mt-1.5 text-xs text-slate-500">{t("signup.fullNameHint", { titles: signupTitles })}</p>
            )}
          </div>
          <div>
            <label className="field-label">{t("signup.email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="text-input"
            />
          </div>
          <div>
            <label className="field-label">{t("signup.password")}</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>
          <div>
            <label className="field-label">{t("signup.confirmPassword")}</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="text-input"
            />
          </div>

          {/* Consent to the Terms and Privacy Policy: unchecked, required.
              The accepted versions are recorded at signup (TH-3). */}
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              {t.rich("signup.consentCheckbox", {
                terms: (chunks) => (
                  <Link href={localePath("/terms")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>
                ),
                privacy: (chunks) => (
                  <Link href={localePath("/privacy")} target="_blank" className="font-semibold text-teal-600 hover:underline">{chunks}</Link>
                ),
              })}
            </span>
          </label>

          <TurnstileWidget onToken={setCaptchaToken} locale={locale} resetKey={captchaReset} />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("signup.submit")}
              </span>
            ) : (
              t("signup.submit")
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {t("signup.hasAccount")}{" "}
          <Link href={localePath("/auth/login")} className="font-semibold text-teal-600 hover:underline">
            {t("signup.logIn")}
          </Link>
        </p>
      </AuthCard>

      <p className="auth-footer-text">
        SolvyMed by{" "}
        <Link href={localePath("/")} className="link-teal">BurrowSoft</Link>
      </p>
    </AuthPageShell>
  );
}

function RoleCard({
  selected, onSelect, icon, label, description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-left transition-all ${
        selected
          ? "border-teal-500 bg-teal-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={selected ? "text-teal-600" : "text-slate-400"}>{icon}</span>
      <span className={`text-sm font-bold leading-tight ${selected ? "text-teal-900" : "text-slate-700"}`}>{label}</span>
      <span className={`text-xs leading-snug text-center ${selected ? "text-teal-700" : "text-slate-400"}`}>{description}</span>
    </button>
  );
}
