"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { acceptSecretaryInvite } from "@/app/[locale]/(site)/join/secretary/[code]/actions";
import { ERROR_KEY } from "@/app/[locale]/(site)/join/secretary/[code]/InviteDecision";

// "Entrar na equipe de outro médico" (0a slice 1b on the website, cf; the
// app's JoinPracticeSheet): a secretary already on one team types the invite
// code another doctor sent her. Only rendered when canJoinAnotherPractice.
// No <form>: the code never goes into a URL, even before hydration.
export function JoinPracticeCard() {
  const t = useTranslations("secretaryPractices");
  const ts = useTranslations("secretary");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [joined, setJoined] = useState("");
  const [pending, start] = useTransition();

  function join() {
    if (pending) return;
    if (!code.trim()) {
      setError(ts("codeRequired"));
      return;
    }
    setError("");
    setJoined("");
    start(async () => {
      const r = await acceptSecretaryInvite(code);
      if (!r.ok) {
        setError(ts(ERROR_KEY[r.code] ?? "genericError"));
        return;
      }
      setCode("");
      setJoined(`${r.doctor.trim() ? t("joinedTeam", { doctor: r.doctor.trim() }) : t("joinedTeamNoName")} ${t("joinPickHint", { label: t("switcherLabel") })}`);
      // The new doctor now shows in "Agenda de".
      router.refresh();
    });
  }

  return (
    <section data-testid="join-practice" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{t("joinRow")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("joinHint")}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
          placeholder={t("joinCode")}
          aria-label={t("joinCode")}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm uppercase text-slate-900 focus:border-teal-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={join}
          disabled={pending || !code.trim()}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {pending ? "…" : t("joinButton")}
        </button>
      </div>
      {error && <div className="error-banner mt-3">{error}</div>}
      {joined && <p data-testid="join-practice-done" className="mt-3 text-sm text-emerald-700">{joined}</p>}
    </section>
  );
}
