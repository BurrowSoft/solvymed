"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { acceptSecretaryInvite, declineSecretaryInvite } from "./actions";

// The "secretary" key for each accept/decline error code (shared with the
// Settings "Entrar na equipe de outro médico" card).
export const ERROR_KEY: Record<string, string> = {
  invite_invalid: "inviteInvalid",
  account_is_patient: "accountIsPatient",
  account_is_professional: "accountIsProfessional",
  account_not_secretary: "accountNotSecretary",
  already_in_a_clinic: "alreadyInClinic",
  team_limit_reached: "teamLimitReachedInvitee",
  // Migration 181: a secretary serves doctors of one country only (cf).
  different_country: "differentCountry",
};

// secondPractice: she is already on another doctor's team (multi-practice on):
// after accepting, say who added her and where to pick them, as the app does,
// instead of dropping her on the dashboard of the doctor she had chosen.
export function InviteDecision({ code, locale, secondPractice = false }: { code: string; locale: string; secondPractice?: boolean }) {
  const t = useTranslations("secretary");
  const tp = useTranslations("secretaryPractices");
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);

  function accept() {
    setError("");
    start(async () => {
      const result = await acceptSecretaryInvite(code);
      if (result.ok && secondPractice) {
        setJoined(`${result.doctor.trim() ? tp("joinedTeam", { doctor: result.doctor.trim() }) : tp("joinedTeamNoName")} ${tp("joinPickHint", { label: tp("switcherLabel") })}`);
        return;
      }
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

  if (joined !== null) {
    return (
      <div className="space-y-4">
        <p data-testid="invite-joined" className="text-center text-sm text-slate-600">{joined}</p>
        <Link
          href={`${prefix}/dashboard`}
          className="block w-full rounded-xl bg-teal-600 px-6 py-3.5 text-center text-base font-bold text-white shadow-md transition hover:bg-teal-700"
        >
          {t("continue")}
        </Link>
      </div>
    );
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
