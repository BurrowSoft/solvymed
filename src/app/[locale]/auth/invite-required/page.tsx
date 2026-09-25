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

    // This page is reachable by any authenticated user, not just the
    // role-less accounts coming from a failed invite confirmation. This
    // client-side check is a UX nicety, not the real authorization boundary
    // (that's server-side, in the linking RPCs — see message to mob dev re:
    // the RPCs' own guard needing the same professionals-row check, since a
    // role-less professional bypasses a user_roles.role-only guard there
    // too). A missing user_roles row is deliberately NOT treated as "safe to
    // proceed": a role-less account could be a legitimate pending patient
    // (first invite attempt, no row yet) OR a professional/secretary whose
    // row was never written, and user_metadata.role is client-writable so it
    // can't disambiguate them. The professionals-table check below is an
    // imperfect but conservative second signal — it can false-positive on a
    // rare legacy pre-071 patient who also has a stray professionals row
    // (they'd see an error and need support to fix the underlying data),
    // but that's a safer failure mode than silently letting a professional
    // attach a patient invite code.
    const [{ data: existingRole }, { data: professionalRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("professionals").select("id").eq("id", user.id).maybeSingle(),
    ]);
    if (existingRole?.role === "professional" || existingRole?.role === "secretary") {
      setLoading(false);
      setError(t("inviteRequired.notPendingPatient"));
      return;
    }
    if (!existingRole?.role && professionalRow) {
      setLoading(false);
      setError(t("inviteRequired.notPendingPatient"));
      return;
    }
    if (user.user_metadata?.role !== "patient") {
      setLoading(false);
      setError(t("inviteRequired.notPendingPatient"));
      return;
    }
    // Refuse to attach a code if this account already has a persisted role
    // at all (including an already-linked patient), rather than silently
    // overwriting it.
    if (existingRole?.role) {
      setLoading(false);
      setError(t("inviteRequired.alreadyHasRole"));
      return;
    }

    // Two distinct code types, tried in sequence: a patient invite code
    // (tied to a specific pre-existing patient record — link is immediate,
    // the RPC creates patient_connections server-side) or a doctor's public
    // code (sets invited_by_professional_id, pending until the doctor
    // confirms via confirm_and_link_patient). Both RPCs own the user_roles
    // write themselves now — atomic, no client-side race to handle.
    const { data: fullyLinked, error: linkError } = await supabase.rpc("link_patient_by_invite_code", { p_code: code });
    if (linkError) {
      setLoading(false);
      setError(
        linkError.message?.includes("too_many_attempts")
          ? t("inviteRequired.tooManyAttempts")
          : t("inviteRequired.linkFailed"),
      );
      return;
    }
    if (fullyLinked) {
      router.push(`${prefix}/auth/patient-welcome`);
      return;
    }

    const { data: profId, error: profLinkError } = await supabase.rpc("link_by_professional_public_code", { p_public_code: code });
    if (profLinkError) {
      setLoading(false);
      setError(
        profLinkError.message?.includes("too_many_attempts")
          ? t("inviteRequired.tooManyAttempts")
          : profLinkError.message?.includes("already_invited_by_another_professional")
          ? t("inviteRequired.alreadyInvitedByAnother")
          : t("inviteRequired.linkFailed"),
      );
      return;
    }
    if (profId) {
      router.push(`${prefix}/auth/pending-confirmation`);
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
            <label htmlFor="invite-required-code" className="field-label">{t("inviteRequired.codeLabel")}</label>
            <input
              id="invite-required-code"
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
