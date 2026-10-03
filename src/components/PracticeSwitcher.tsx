"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { setBrowserActingCookie, type MyPractice } from "@/lib/actingPractice";
import { brandAccent, readableAccent } from "@/lib/readableAccent";

// "Agenda de ▾" for a secretary serving several doctors (1.5.0, migration
// 163; behind liveFeatures.multiPractice). Only doctors from
// get_my_practices() are offered, so the x-acting-practice header never
// names one she doesn't serve. A choice reloads the page: the browser
// Supabase client is created once per page, with the header baked in.
// ("Todos", the combined schedule, comes with migration 166.)
export function PracticeSwitcher({ practices, current }: { practices: MyPractice[]; current: string }) {
  const t = useTranslations("secretaryPractices");
  const chosen = practices.find((p) => p.professional_id === current) ?? practices[0];
  const dot = readableAccent(brandAccent(chosen?.accent_color), "#ffffff");
  return (
    <label data-testid="practice-switcher" className="flex items-center gap-2 text-sm text-slate-600">
      <span className="font-semibold">{t("switcherLabel")}</span>
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <select
        value={chosen?.professional_id}
        onChange={(e) => {
          setBrowserActingCookie(e.target.value);
          try { sessionStorage.removeItem(RESET_KEY); } catch { /* none */ }
          window.location.reload();
        }}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800"
      >
        {practices.map((p) => (
          <option key={p.professional_id} value={p.professional_id}>{p.display_name ?? "—"}</option>
        ))}
      </select>
    </label>
  );
}

// A stale choice (she no longer serves that doctor): the server would act
// for no practice, so clear it and reload on her primary.
// One reload per tab at most (9a): if the cookie can't be cleared (or the
// list keeps failing), the page stays as it is instead of looping.
const RESET_KEY = "sm_practice_reset";
export function ActingPracticeReset() {
  useEffect(() => {
    setBrowserActingCookie(null);
    let again = true;
    try {
      again = sessionStorage.getItem(RESET_KEY) !== "1";
      sessionStorage.setItem(RESET_KEY, "1");
    } catch { /* no storage: reload once anyway */ }
    if (again) window.location.reload();
  }, []);
  return null;
}
