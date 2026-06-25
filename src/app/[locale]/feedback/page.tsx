"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { submitFeedback } from "./actions";

const RATINGS = [
  { value: 1, label: "😞" },
  { value: 2, label: "😐" },
  { value: 3, label: "🙂" },
  { value: 4, label: "😊" },
  { value: 5, label: "🤩" },
];

export default function FeedbackPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const localePath = (path: string) => locale === "en" ? path : `/${locale}${path}`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("email", email);
    fd.set("message", message);
    if (rating) fd.set("rating", String(rating));
    const result = await submitFeedback(fd);
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
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Thank you!</h1>
          <p className="mb-8 text-slate-500">Your feedback helps us improve SolvyMed for everyone.</p>
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
          <Link href={localePath("/")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors">
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

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">Share your feedback</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          We'd love to hear what you think about SolvyMed.
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              How would you rate SolvyMed? <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex gap-3">
              {RATINGS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(rating === r.value ? null : r.value)}
                  className={`flex-1 rounded-xl border-2 py-2 text-2xl transition ${
                    rating === r.value
                      ? "border-teal-500 bg-teal-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email <span className="text-red-500">*</span>
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
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Tell us what you think, what's missing, or what we could do better..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
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
                Sending…
              </span>
            ) : (
              "Send feedback"
            )}
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-slate-400">SolvyMed by BurrowSoft</p>
    </div>
  );
}
