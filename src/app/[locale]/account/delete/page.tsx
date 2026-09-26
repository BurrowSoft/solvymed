"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { requestAccountDeletion } from "./actions";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";
import { Logo } from "@/components/Logo";

const SUPPORT_EMAIL = "support@solvymed.com";

// Public account-deletion request (the deletion link in the app-store
// listings): anyone can ask, signed in or not, and support processes it.
// What happens differs by account type, so the note says so up front:
// professionals' patient records must be kept (20 years), patients' own
// accounts are deleted and their clinic keeps its records.
export default function AccountDeletePage() {
  const t = useTranslations("accountDelete");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const localePath = (path: string) => (locale === "en" ? path : `/${locale}${path}`);
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("closeSubject"))}`;

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("reason", reason);
    const result = await requestAccountDeletion(fd);
    setLoading(false);
    if (result?.error) {
      setError(t(result.error === "email_required" ? "errorEmailRequired" : "errorGeneric", { email: SUPPORT_EMAIL }));
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <IconBadge>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </IconBadge>
          <h1 className="auth-heading">{t("doneTitle")}</h1>
          <p className="mb-2 text-slate-500">
            {t.rich("doneBody", { email, b: (chunks) => <span className="font-semibold text-slate-700">{chunks}</span> })}
          </p>
          <p className="mb-8 text-sm text-slate-400">{t("doneSub")}</p>
          <Link href={localePath("/")} className="text-sm font-semibold text-teal-600 hover:underline">
            {t("backToHome")}
          </Link>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <div className="mb-6">
          <Link href={localePath("/")} className="back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {t("backToHome")}
          </Link>
        </div>

        <Logo />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">{t("intro")}</p>

        <div className="mb-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{t("whatHappensTitle")}</p>
          <p>{t.rich("professionals", { b: (chunks) => <strong>{chunks}</strong> })}</p>
          <p>{t.rich("patients", { b: (chunks) => <strong>{chunks}</strong> })}</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="delete-email" className="field-label">
              {t("emailLabel")} <span className="text-red-500">*</span>
            </label>
            <input
              id="delete-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              className="text-input"
            />
          </div>

          <div>
            <label htmlFor="delete-reason" className="field-label">
              {t("reasonLabel")} <span className="text-slate-400 font-normal">{t("optional")}</span>
            </label>
            <textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t("reasonPlaceholder")}
              className="text-input resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-white" />
                {t("submitting")}
              </span>
            ) : (
              t("submit")
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          {t("preferEmail")}{" "}
          <a href={mailto} className="link-teal">{t("emailSupport")}</a>
        </p>
      </AuthCard>

      <p className="auth-footer-text">SolvyMed by BurrowSoft</p>
    </AuthPageShell>
  );
}
