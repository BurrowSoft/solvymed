"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Role = "professional" | "secretary" | "patient";

export default function SignupPage() {
  const t = useTranslations("auth");
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) ?? "en";

  const joinProfId = searchParams.get("join") ?? "";
  const urlRole = searchParams.get("role") as Role | null;
  const isJoinFlow = !!joinProfId;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>(
    urlRole === "patient" || urlRole === "secretary" || urlRole === "professional"
      ? urlRole
      : "professional",
  );
  const [inviteCode, setInviteCode] = useState("");
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

    setLoading(true);
    const supabase = createClient();
    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          platform: "web",
          ...(joinProfId
            ? { join_professional_id: joinProfId, join_role: role }
            : role === "patient" && inviteCode.trim()
            ? { invite_code: inviteCode.toUpperCase().trim() }
            : {}),
        },
        emailRedirectTo: "https://www.solvymed.com/api/auth/callback",
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
          <div className="mb-6 flex justify-center">
            <img src="/solvymed_logo.png" alt="SolvyMed" className="h-14 w-14 rounded-2xl shadow-lg" />
          </div>
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">{t("signup.success")}</h1>
          <p className="mb-8 text-slate-500">{t("signup.successSub")}</p>
          <Link href={localePath("/")} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 transition-colors">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        {/* Back */}
        <div className="mb-6">
          <Link href={localePath("/")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {t("backToHome")}
          </Link>
        </div>

        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{t("signup.title")}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">{t("signup.subtitle")}</p>

        {/* Role picker — hidden when joining via invite link */}
        {isJoinFlow ? (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-sm text-teal-700">
            {t("signup.joiningAs", { role })}
          </div>
        ) : (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-slate-700">{t("signup.iAmA")}</p>
          <div className="grid grid-cols-3 gap-3">
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
              selected={role === "secretary"}
              onSelect={() => setRole("secretary")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              }
              label={t("signup.roleSecretary")}
              description={t("signup.roleSecretaryDesc")}
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
        </div>
        )}

        {/* Invite code — patients only, hidden when joining via link */}
        {!isJoinFlow && role === "patient" && (
          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("signup.inviteCode")} <span className="font-normal text-slate-400">{t("signup.inviteCodeOptional")}</span>
            </label>
            <input
              type="text"
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
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("signup.fullName")}</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("signup.email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("signup.password")}</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("signup.confirmPassword")}</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
      </div>

      <p className="mt-8 text-sm text-slate-400">
        SolvyMed by{" "}
        <Link href={localePath("/")} className="text-teal-600 hover:underline">BurrowSoft</Link>
      </p>
    </div>
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
