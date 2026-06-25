"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { requestAccountDeletion } from "./actions";

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
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Request received</h1>
          <p className="mb-2 text-slate-500">
            We've received your account deletion request for <span className="font-semibold text-slate-700">{email}</span>.
          </p>
          <p className="mb-8 text-sm text-slate-400">
            Our team will process it within 30 days and send a confirmation to your email.
          </p>
          <Link href={localePath("/")} className="text-sm font-semibold text-teal-600 hover:underline">
            Back to home
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
          <Link
            href={localePath("/")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to home
          </Link>
        </div>

        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <img src="/solvymed_logo.png" alt="SolvyMed" className="h-14 w-14 rounded-2xl shadow-lg" />
        </div>

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">Delete your account</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Submit your request below. We'll delete your account and all associated data within 30 days.
        </p>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Warning:</strong> This action is permanent. All your data including appointments, medical records, and prescriptions will be erased and cannot be recovered.
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reason <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Tell us why you're leaving..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Submitting…
              </span>
            ) : (
              "Request account deletion"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Need help instead?{" "}
          <a href="mailto:support@burrowsoft.com" className="text-teal-600 hover:underline">
            Contact support
          </a>
        </p>
      </div>

      <p className="mt-8 text-sm text-slate-400">SolvyMed by BurrowSoft</p>
    </div>
  );
}
