"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";

export default function InviteRequiredPage() {
  const t = useTranslations("auth");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = inviteCode.trim();
    if (!code) {
      setError(t("inviteRequired.codeRequired"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      router.push(`${prefix}/auth/login`);
      return;
    }

    const { data: patientData } = await supabase.rpc("patient_by_invite_code", { code });
    if (patientData?.length) {
      await supabase.from("user_roles").upsert(
        { user_id: user.id, role: "patient", linked_patient_id: patientData[0].patient_id },
        { onConflict: "user_id" },
      );
      router.push(`${prefix}/auth/patient-welcome`);
      return;
    }

    const { data: profData } = await supabase.rpc("professional_by_invite_code", { code });
    if (profData?.length) {
      await supabase.from("user_roles").upsert(
        { user_id: user.id, role: "patient", invited_by_professional_id: profData[0].professional_id },
        { onConflict: "user_id" },
      );
      router.push(`${prefix}/auth/patient-welcome`);
      return;
    }

    setLoading(false);
    setError(t("inviteRequired.codeInvalid"));
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/signup`);
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </IconBadge>

        <h1 className="auth-heading text-center">{t("inviteRequired.heading")}</h1>
        <p className="mb-6 text-center text-slate-500">
          {t("inviteRequired.body")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">{t("inviteRequired.codeLabel")}</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              className="w-full rounded-xl border border-teal-200 bg-white px-4 py-3 text-base font-mono tracking-widest uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("inviteRequired.submitting")}
              </span>
            ) : (
              t("inviteRequired.submit")
            )}
          </button>
        </form>

        <button
          onClick={handleSignOut}
          className="mt-4 w-full text-sm text-slate-400 hover:text-teal-600 transition"
        >
          {t("inviteRequired.backToSignup")}
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}
