"use client";

import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";

export default function InviteRequiredPage() {
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/signup`);
  }

  return (
    <AuthPageShell>
      <AuthCard centered>
        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </IconBadge>

        <h1 className="auth-heading">An invite code is needed</h1>
        <p className="mb-8 text-slate-500">
          Your account was created, but SolvyMed patients can only join through an
          invite code from their doctor. Ask your doctor for their invite code,
          then sign up again with it.
        </p>

        <button
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
        >
          Back to sign up
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}
