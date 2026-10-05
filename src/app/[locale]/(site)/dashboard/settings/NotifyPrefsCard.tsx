"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DoctorDot } from "@/components/DoctorTag";
import { withBrandTitle } from "@/lib/doctorName";
import { setNotifyPref } from "./notify-actions";

export type NotifyPref = { professional_id: string; display_name: string | null; title: string | null; accent_color: string | null; muted: boolean };

// "Notificações por médico" (166, cf): one switch per doctor she serves. Only
// the app gets pushes, so the card says so; all muted is allowed, with a hint.
// colors: each doctor's colour by id (lib/doctorPalette, as on "Todos").
export function NotifyPrefsCard({ prefs: initial, colors = {} }: { prefs: NotifyPref[]; colors?: Record<string, string> }) {
  const t = useTranslations("secretaryPractices");
  const tCommon = useTranslations("secretary");
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [, start] = useTransition();

  function toggle(p: NotifyPref) {
    const muted = !p.muted;
    setBusy(p.professional_id);
    setError(false);
    start(async () => {
      const r = await setNotifyPref(p.professional_id, muted);
      if (r.ok) setPrefs((list) => list.map((x) => (x.professional_id === p.professional_id ? { ...x, muted } : x)));
      else setError(true);
      setBusy(null);
    });
  }

  const allMuted = prefs.length > 0 && prefs.every((p) => p.muted);
  return (
    <section data-testid="notify-prefs" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{t("notifyTitle")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("notifyHint")} {t("notifyAppHint")}</p>
      {error && <div className="error-banner mt-3">{tCommon("genericError")}</div>}
      <ul className="mt-4 divide-y divide-slate-100">
        {prefs.map((p) => {
          const name = withBrandTitle(p.title, p.display_name) || "—";
          const on = !p.muted;
          return (
            <li key={p.professional_id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                {colors[p.professional_id] && <DoctorDot color={colors[p.professional_id]} className="h-2.5 w-2.5" />}
                <span className="truncate">{name}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={name}
                disabled={busy === p.professional_id}
                onClick={() => toggle(p)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-teal-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          );
        })}
      </ul>
      {allMuted && <p data-testid="all-muted" className="mt-3 text-sm font-semibold text-amber-700">{t("allMuted")}</p>}
    </section>
  );
}
