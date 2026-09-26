"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { markInviteShared } from "@/lib/setupActions";

// "Share invite link" (first-run): copies the doctor's public join link.
// Without a code yet, it opens Settings, where the invite code is created.
export function ShareInviteLinkButton({ code, className = "", size = "md" }: { code: string | null; className?: string; size?: "md" | "sm" }) {
  const t = useTranslations("firstRun");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [copied, setCopied] = useState(false);

  const padding = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  const style = `inline-flex shrink-0 items-center justify-center rounded-xl border border-teal-600 ${padding} font-bold text-teal-700 transition hover:bg-teal-50 ${className}`;

  if (!code) {
    return <Link href={`${prefix}/dashboard/settings`} className={style}>{t("shareInviteLink")}</Link>;
  }

  function handleCopy() {
    // Unprefixed: the patient's own browser language decides (UX rule for
    // links shared with patients).
    navigator.clipboard.writeText(`${window.location.origin}/join/${code}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Setup checklist item 6 (best-effort).
      markInviteShared().catch(() => {});
    }).catch(() => {});
  }

  return (
    <button type="button" onClick={handleCopy} className={style} aria-live="polite">
      {copied ? t("linkCopied") : t("shareInviteLink")}
    </button>
  );
}
