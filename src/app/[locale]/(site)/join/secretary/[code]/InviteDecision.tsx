"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { acceptSecretaryInvite, declineSecretaryInvite } from "./actions";

const ERROR_KEY: Record<string, string> = {
  invite_invalid: "inviteInvalid",
  account_is_patient: "accountIsPatient",
  account_is_professional: "accountIsProfessional",
  account_not_secretary: "accountNotSecretary",
  already_in_a_clinic: "alreadyInClinic",
  team_limit_reached: "teamLimitReachedInvitee",
};

export function InviteDecision({ code, locale }: { code: string; locale: string }) {
  const t = useTranslations("secretary");
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState(false);

  function accept() {
    setError("");
    start(async () => {
      const result = await acceptSecretaryInvite(code);
      if (result.ok) {
        router.push(`${prefix}/dashboard`);
        router.refresh();
        return;
      }
      setError(t(ERROR_KEY[result.code] ?? "genericError"));
    });
  }

  function decline() {
    setError("");
    start(async () => {
      const result = await declineSecretaryInvite(code);
      if (result.ok) {
        setDeclined(true);
        return;
      }
      setError(t(ERROR_KEY[result.code] ?? "genericError"));
    });
  }

  if (declined) {
    return <p className="text-center text-sm text-slate-500">{t("inviteDeclined")}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <div className="error-banner">{error}</div>}
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-teal-700 disabled:opacity-60"
      >
        {pending ? "…" : t("accept")}
      </button>
      <button
        type="button"
        onClick={decline}
        disabled={pending}
        className="w-full rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {t("decline")}
      </button>
    </div>
  );
}
