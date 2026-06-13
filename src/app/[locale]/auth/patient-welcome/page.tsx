"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const COUNTDOWN = 5;

export default function PatientWelcomePage() {
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const router = useRouter();

  const [count, setCount] = useState(COUNTDOWN);

  const discoverPath = `${prefix}/discover`;

  useEffect(() => {
    if (count <= 0) {
      router.push(discoverPath);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, discoverPath, router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/login`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
        </div>

        {/* Checkmark */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-extrabold text-slate-900">You&apos;re all set!</h1>
        <p className="mb-1 text-slate-500">Your account has been confirmed.</p>

        {/* Countdown */}
        <p className="mb-6 text-sm text-slate-400">
          Taking you to find a clinic in{" "}
          <span className="font-semibold tabular-nums text-teal-600">{count}</span>
          {count === 1 ? " second" : " seconds"}…
        </p>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-1000 ease-linear"
            style={{ width: `${((COUNTDOWN - count) / COUNTDOWN) * 100}%` }}
          />
        </div>

        <a
          href={discoverPath}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95 mb-4"
        >
          Find a clinic now
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
      </div>
    </div>
  );
}
