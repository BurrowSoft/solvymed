"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { submitFeedback } from "./actions";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { Logo } from "@/components/Logo";
import { IconBadge } from "@/components/IconBadge";

const RATINGS = [
  { value: 1, label: "😞" },
  { value: 2, label: "😐" },
  { value: 3, label: "🙂" },
  { value: 4, label: "😊" },
  { value: 5, label: "🤩" },
];

export default function FeedbackPage() {
  const t = useTranslations("feedback");
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
      setError(t(`errors.${result.error}`));
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
          <h1 className="auth-heading">{t("thanksTitle")}</h1>
          <p className="mb-8 text-slate-500">{t("thanksBody")}</p>
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
        {/* Back */}
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
        <p className="mb-6 text-center text-sm text-slate-500">{t("subtitle")}</p>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t("ratingLabel")} <span className="text-slate-400 font-normal">{t("optional")}</span>
            </label>
            <div className="flex gap-3">
              {RATINGS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  aria-label={t("ratingValue", { n: r.value })}
                  aria-pressed={rating === r.value}
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
            <label className="field-label">
              {t("name")} <span className="text-slate-400 font-normal">{t("optional")}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="text-input"
            />
          </div>

          <div>
            <label className="field-label">
              {t("email")} <span className="text-red-500">*</span>
            </label>
            <input
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
            <label className="field-label">
              {t("message")} <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t("messagePlaceholder")}
              className="text-input resize-none"
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
                {t("sending")}
              </span>
            ) : (
              t("send")
            )}
          </button>
        </form>
      </AuthCard>

      <p className="auth-footer-text">SolvyMed by BurrowSoft</p>
    </AuthPageShell>
  );
}
