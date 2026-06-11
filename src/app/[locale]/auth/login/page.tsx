"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const t = useTranslations("auth");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const localePath = (path: string) =>
    locale === "en" ? path : `/${locale}${path}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (authError) {
      setError(t("login.error"));
    } else {
      router.push(localePath("/dashboard"));
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        {/* Back to home */}
        <div className="mb-6">
          <Link
            href={localePath("/")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
          >
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

        <h1 className="mb-1 text-center text-2xl font-extrabold text-slate-900">
          {t("login.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          {t("login.subtitle")}
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("login.email")}
            </label>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                {t("login.password")}
              </label>
              <Link
                href={localePath("/auth/forgot-password")}
                className="text-xs text-teal-600 hover:underline"
              >
                {t("login.forgotPassword")}
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
                {t("login.submit")}
              </span>
            ) : (
              t("login.submit")
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {t("login.noAccount")}{" "}
          <Link
            href={localePath("/auth/signup")}
            className="font-semibold text-teal-600 hover:underline"
          >
            {t("login.signUp")}
          </Link>
        </p>
      </div>

      <p className="mt-8 text-sm text-slate-400">
        SolvyMed by{" "}
        <Link href={localePath("/")} className="text-teal-600 hover:underline">
          BurrowSoft
        </Link>
      </p>
    </div>
  );
}
