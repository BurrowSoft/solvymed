"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { BrandMark } from "@/components/BrandMark";
import { IconBadge } from "@/components/IconBadge";

// Shown once, right after a professional confirms their email (first-run
// spec §1). "Start setup" opens the dashboard with the setup checklist
// expanded; "Skip for now" opens it with the checklist collapsed.
export default function ProfessionalWelcomePage() {
  const t = useTranslations("auth.professionalWelcome");
  const { locale } = useParams<{ locale: string }>();
  const dashboardPath = locale === "en" ? "/dashboard" : `/${locale}/dashboard`;
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      const full = (user?.user_metadata?.full_name as string | undefined)?.trim();
      if (full) setFirstName(full.split(/\s+/)[0]);
    }).catch(() => {});
  }, []);

  return (
    <AuthPageShell>
      <AuthCard centered>
        <BrandMark />

        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </IconBadge>

        <h1 className="auth-heading">{firstName ? t("title", { firstName }) : t("titleNoName")}</h1>
        <p className="mb-8 text-slate-500">{t("body")}</p>

        <Link
          href={`${dashboardPath}?setup=1`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
        >
          {t("startSetup")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 rtl:rotate-180">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
        <Link href={dashboardPath} className="mt-4 inline-block text-sm font-semibold text-slate-500 transition hover:text-teal-700">
          {t("skip")}
        </Link>
      </AuthCard>
    </AuthPageShell>
  );
}
