"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { keepInvitedPatient, removeInvitedPatient } from "./patients/actions";

type Invited = { id: string; full_name: string; sameEmailAs: { id: string; name: string } | null };

// "{n} novo(s) paciente(s) pelo convite" (migration 145, UX): patients who
// joined with the practice's invite code, not yet kept or removed. Manter
// keeps the record (no badge); Remover unlinks the account and archives the
// record. Both answers are final, so each row waits for its own reply.
export function InvitedPatientsCard({ patients, total, prefix }: { patients: Invited[]; total: number; prefix: string }) {
  const t = useTranslations("home");
  const [done, setDone] = useState<Record<string, "kept" | "removed">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  function act(id: string, kind: "keep" | "remove", name: string) {
    // Removing is final for this account: ask first (the app's confirm).
    if (kind === "remove" && !window.confirm(t("invitedRemoveConfirm", { name }))) return;
    setErrors((e) => ({ ...e, [id]: "" }));
    setPendingId(id);
    start(async () => {
      const r = kind === "keep" ? await keepInvitedPatient(id) : await removeInvitedPatient(id);
      setPendingId(null);
      if (r.ok) setDone((d) => ({ ...d, [id]: kind === "keep" ? "kept" : "removed" }));
      else setErrors((e) => ({ ...e, [id]: t("invitedError") }));
    });
  }

  const left = total - Object.keys(done).length;
  if (left <= 0) return null;
  return (
    <section aria-labelledby="invited-title" className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
      <h2 id="invited-title" className="text-sm font-bold text-teal-900">{t("invitedTitle", { n: left })}</h2>
      <p className="mt-0.5 text-xs text-teal-800">{t("invitedHint")}</p>
      <ul className="mt-3 space-y-2">
        {patients.filter((p) => !done[p.id]).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
            <div className="min-w-0">
              <Link href={`${prefix}/dashboard/patients/${p.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline">{p.full_name}</Link>
              {p.sameEmailAs && (
                <Link href={`${prefix}/dashboard/patients/${p.id}?mergeWith=${p.sameEmailAs.id}`} className="block truncate text-xs font-semibold text-amber-700 hover:underline">
                  {t("invitedSameEmail", { name: p.sameEmailAs.name })}
                </Link>
              )}
              {errors[p.id] && <p className="text-xs text-red-600">{errors[p.id]}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={pendingId === p.id} aria-busy={pendingId === p.id} onClick={() => act(p.id, "keep", p.full_name)}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60">
                {t("invitedKeep")}
              </button>
              <button type="button" disabled={pendingId === p.id} onClick={() => act(p.id, "remove", p.full_name)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                {t("invitedRemove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {total > patients.length && (
        <Link href={`${prefix}/dashboard/patients`} className="mt-3 inline-block text-xs font-bold text-teal-800 underline">{t("invitedSeeAll")}</Link>
      )}
    </section>
  );
}
