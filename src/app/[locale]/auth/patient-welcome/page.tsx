"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";

const COUNTDOWN = 5;

// Width classes for each remaining-seconds value (COUNTDOWN..0). Must stay in
// sync with COUNTDOWN — Tailwind needs the full literal class names in source.
const PROGRESS_WIDTH_CLASS = ["w-0", "w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"];

export default function PatientWelcomePage() {
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const router = useRouter();

  const [count, setCount] = useState(COUNTDOWN);
  const [email, setEmail] = useState<string | null>(null);

  const myAppointmentsPath = `${prefix}/my-appointments`;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (count <= 0) {
      router.push(myAppointmentsPath);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, myAppointmentsPath, router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/login`);
  }

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />

        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </IconBadge>

        <h1 className="auth-heading">You&apos;re all set!</h1>
        <p className="mb-1 text-slate-500">Your account has been confirmed.</p>
        {email && (
          <p className="mb-1 text-sm font-medium text-slate-700">{email}</p>
        )}

        {/* Countdown */}
        <p className="mb-6 text-sm text-slate-400">
          Taking you to your appointments in{" "}
          <span className="font-semibold tabular-nums text-teal-600">{count}</span>
          {count === 1 ? " second" : " seconds"}…
        </p>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-teal-500 transition-all duration-1000 ease-linear ${PROGRESS_WIDTH_CLASS[COUNTDOWN - count]}`}
          />
        </div>

        <a
          href={myAppointmentsPath}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95 mb-4"
        >
          Go to My Appointments
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>

        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-teal-600 transition"
        >
          Sign out
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}
