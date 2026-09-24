"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { requestAccountDeletion } from "./actions";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";
import { Logo } from "@/components/Logo";

export default function AccountDeletePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const localePath = (path: string) => locale === "en" ? path : `/${locale}${path}`;

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
      setError(result.error);
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
          <h1 className="auth-heading">Request received</h1>
          <p className="mb-2 text-slate-500">
            We've received your account deletion request for <span className="font-semibold text-slate-700">{email}</span>.
          </p>
          <p className="mb-8 text-sm text-slate-400">
            Our team will process it within 30 days and send a confirmation to your email.
          </p>
          <Link href={localePath("/")} className="text-sm font-semibold text-teal-600 hover:underline">
            Back to home
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
          <Link
            href={localePath("/")}
            className="back-link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to home
          </Link>
        </div>

        <Logo />

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">Delete your account</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Submit your request below. We'll delete your account and all associated data within 30 days.
        </p>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Warning:</strong> This action is permanent. All your data including appointments, medical records, and prescriptions will be erased and cannot be recovered.
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="text-input"
            />
          </div>

          <div>
            <label className="field-label">
              Reason <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Tell us why you're leaving..."
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
                Submitting…
              </span>
            ) : (
              "Request account deletion"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Need help instead?{" "}
          <a href="mailto:support@burrowsoft.com" className="link-teal">
            Contact support
          </a>
        </p>
      </AuthCard>

      <p className="auth-footer-text">SolvyMed by BurrowSoft</p>
    </AuthPageShell>
  );
}
