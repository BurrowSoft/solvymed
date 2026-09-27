"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { setSetupHidden } from "@/lib/setupActions";

// Shown only when the doctor hid the setup checklist before finishing it:
// brings it back on Home.
export function ShowSetupRow() {
  const t = useTranslations("settings");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        await setSetupHidden(false);
        router.push(`${locale === "en" ? "" : `/${locale}`}/dashboard`);
      })}
      className="w-full rounded-2xl border border-dashed border-teal-300 bg-teal-50/50 px-5 py-3 text-left text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
    >
      {t("showSetup")}
    </button>
  );
}
