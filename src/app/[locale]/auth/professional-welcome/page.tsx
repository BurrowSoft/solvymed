"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";

const COUNTDOWN = 5;

// Width classes for each remaining-seconds value (COUNTDOWN..0). Must stay in
// sync with COUNTDOWN — Tailwind needs the full literal class names in source.
const PROGRESS_WIDTH_CLASS = ["w-0", "w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"];

export default function ProfessionalWelcomePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const dashboardPath = locale === "en" ? "/dashboard" : `/${locale}/dashboard`;

  const [count, setCount] = useState(COUNTDOWN);

  useEffect(() => {
    if (count <= 0) {
      router.push(dashboardPath);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, dashboardPath, router]);

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />

        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </IconBadge>

        <h1 className="mb-2 text-2xl font-extrabold text-slate-900">You&apos;re all set!</h1>
        <p className="mb-1 text-slate-500">Your account has been confirmed. Welcome to SolvyMed.</p>

        {/* Countdown */}
        <p className="mb-8 text-sm text-slate-400">
          Redirecting to your dashboard in{" "}
          <span className="font-semibold tabular-nums text-teal-600">{count}</span>
          {count === 1 ? " second" : " seconds"}…
        </p>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-teal-500 transition-all duration-1000 ease-linear ${PROGRESS_WIDTH_CLASS[COUNTDOWN - count]}`}
          />
        </div>

        <Link
          href={dashboardPath}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
        >
          Go to dashboard now
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </AuthCard>

      <p className="mt-8 text-sm text-slate-400">
        SolvyMed by{" "}
        <a href="/" className="text-teal-600 hover:underline">BurrowSoft</a>
      </p>
    </AuthPageShell>
  );
}
