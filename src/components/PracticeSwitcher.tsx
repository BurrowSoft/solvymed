"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ALL_PRACTICES, PICKED_KEY, isLapsed, setBrowserActingCookie, type MyPractice } from "@/lib/actingPractice";
import { doctorColor } from "@/lib/doctorPalette";
import { withBrandTitle } from "@/lib/doctorName";

// "Agenda de ▾" for a secretary serving several doctors (1.5.0, migration
// 163; behind liveFeatures.multiPractice). Only doctors from
// get_my_practices() are offered, so the x-acting-practice header never
// names one she doesn't serve. A choice reloads the page: the browser
// Supabase client is created once per page, with the header baked in.
// "Todos" (166): on the Agenda only, every doctor's appointments in one
// view; remembered like a doctor choice. Elsewhere the pages are her
// primary doctor's, so the switcher shows that doctor there.
export function PracticeSwitcher({ practices, current, allChosen = false }: { practices: MyPractice[]; current: string; allChosen?: boolean }) {
  const t = useTranslations("secretaryPractices");
  const onAgenda = /\/dashboard\/schedule\/?$/.test(usePathname() ?? "");
  const showAll = onAgenda && allChosen;
  const chosen = practices.find((p) => p.professional_id === current) ?? practices[0];
  // The doctor's colour, as on "Todos" (lib/doctorPalette: by her list's order).
  const at = practices.findIndex((p) => p.professional_id === chosen?.professional_id);
  const dot = showAll || at < 0 ? null : doctorColor(at);
  return (
    <label data-testid="practice-switcher" className="flex items-center gap-2 text-sm text-slate-600">
      <span className="font-semibold">{t("switcherLabel")}</span>
      {dot && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <select
        value={showAll ? ALL_PRACTICES : chosen?.professional_id}
        onChange={(e) => {
          setBrowserActingCookie(e.target.value);
          try {
            sessionStorage.removeItem(RESET_KEY);
            sessionStorage.setItem(PICKED_KEY, e.target.value);
          } catch { /* none */ }
          window.location.reload();
        }}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800"
      >
        {onAgenda && <option value={ALL_PRACTICES}>{t("all")}</option>}
        {practices.map((p) => (
          <option key={p.professional_id} value={p.professional_id}>{practiceLabel(p, t("inactiveSuffix"))}</option>
        ))}
      </select>
    </label>
  );
}

// The doctor's name, with " · assinatura inativa" when their subscription lapsed (d1/cf).
export function practiceLabel(p: MyPractice, inactiveSuffix: string): string {
  return `${withBrandTitle(p.title, p.display_name) || "—"}${isLapsed(p) ? inactiveSuffix : ""}`;
}

// The inactive screen (2+ doctors): her other doctors, to switch to one.
// A pick counts as hers, so she isn't moved off it again (PICKED_KEY).
export function SwitchDoctorList({ practices, current, href }: { practices: MyPractice[]; current: string; href: string }) {
  const t = useTranslations("secretaryPractices");
  const others = practices.filter((p) => p.professional_id !== current);
  if (others.length === 0) return null;
  return (
    <section data-testid="switch-doctor" className="mb-6 text-left">
      <h2 className="mb-2 text-sm font-bold text-slate-700">{t("switchDoctor")}</h2>
      <ul className="space-y-2">
        {others.map((p) => (
          <li key={p.professional_id}>
            <button
              type="button"
              onClick={() => {
                setBrowserActingCookie(p.professional_id);
                try { sessionStorage.setItem(PICKED_KEY, p.professional_id); } catch { /* none */ }
                window.location.assign(href);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {practiceLabel(p, t("inactiveSuffix"))}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// On load (d1/cf): her remembered doctor lapsed and another is active → open
// the active one, unless she picked the lapsed one herself in this tab. Once
// per tab at most, so a cookie that can't be written never loops.
const AUTO_KEY = "sm_practice_auto";
export function OpenActivePractice({ lapsed, target, href }: { lapsed: string; target: string; href: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PICKED_KEY) === lapsed) return;
      if (sessionStorage.getItem(AUTO_KEY) === lapsed) return;
      sessionStorage.setItem(AUTO_KEY, lapsed);
    } catch { /* no storage: once per load */ }
    setBrowserActingCookie(target);
    window.location.replace(href);
  }, [lapsed, target, href]);
  return null;
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
