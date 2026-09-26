"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";
import { isWellFormedSecretaryCode, normalizeSecretaryCode } from "@/lib/secretary";

type Role = "professional" | "secretary" | "patient";

export default function SignupPage() {
  const t = useTranslations("auth");
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
  const secretaryCode = isJoinFlow ? "" : normalizeSecretaryCode(searchParams.get("secretary") ?? "");
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

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    if (role === "patient" && !inviteCode.trim()) {
      setError(t("signup.inviteCodeRequired"));
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Catch a wrong email before the account exists, not after the
    // confirmation email when accepting fails. BROWSER ONLY (see migration
    // 093's header): the RPC is rate-limited per client IP. Any other error
    // lets signup go ahead, since the accept-time check still applies.
    if (role === "secretary" && isSecretaryFlow && isWellFormedSecretaryCode(secretaryCode)) {
      const { data: matches, error: matchError } = await supabase.rpc("secretary_invite_email_matches", {
        p_code: secretaryCode,
        p_email: email,
      });
      if (matchError?.message?.includes("too_many_attempts")) {
        setLoading(false);
        setError(t("inviteRequired.tooManyAttempts"));
        return;
      }
      if (!matchError && matches === false) {
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
      },
    });
    setLoading(false);

    if (authError) {
      setError(t("signup.error"));
    } else if (signUpData.user?.identities?.length === 0) {
      // Supabase returns an empty identities array (no error) when the email is
      // already registered — avoid leaking "email exists" by pointing to login.
      setError(t("signup.emailExists"));
    } else {
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

  return (
    <AuthPageShell>
      <AuthCard>
        {/* Back */}
        <div className="mb-6">
          <Link href={localePath("/")} className="back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {t("backToHome")}
          </Link>
        </div>

        <BrandMark />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{t("signup.title")}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">{t("signup.subtitle")}</p>

        {/* Role picker — hidden when joining via invite link */}
        {isJoinFlow ? (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm text-teal-700">
            {t("signup.joiningAs", { role: "patient" })}
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
              required
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
