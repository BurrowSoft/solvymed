"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { leaveClinic } from "./team-actions";

export function LeaveClinicButton({ doctorName, locale }: { doctorName: string | null; locale: string }) {
  const t = useTranslations("secretary");
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function leave() {
    const ok = window.confirm(doctorName ? t("leaveConfirmNamed", { name: doctorName }) : t("leaveConfirm"));
    if (!ok) return;
    setError("");
    start(async () => {
      const result = await leaveClinic();
      if (!result.ok) {
        setError(t("genericError"));
        return;
      }
      // Unlinked now: the dashboard would route here anyway.
      router.push(`${prefix}/auth/not-connected`);
      router.refresh();
    });
  }

  return (
    <div>
      {error && <div className="error-banner mb-3">{error}</div>}
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "…" : doctorName ? t("leaveClinicNamed", { name: doctorName }) : t("leaveClinic")}
      </button>
    </div>
  );
}
