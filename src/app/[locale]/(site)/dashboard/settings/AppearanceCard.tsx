"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";
import { THEME_COOKIE, parseTheme, type ThemeChoice } from "@/lib/theme";

// Configurações → Aparência (Help C8): Automático (the system setting) /
// Claro / Escuro, for this browser. Applied at once (the dashboard's
// theme scope) and kept in a cookie so the next page renders it too.
export function AppearanceCard() {
  const t = useTranslations("settings");
  const [choice, setChoice] = useState<ThemeChoice>("auto");
  useEffect(() => {
    const root = document.querySelector("[data-theme-root]");
    setChoice(parseTheme(root?.getAttribute("data-theme")));
  }, []);

  const pick = (v: ThemeChoice) => {
    setChoice(v);
    document.querySelector("[data-theme-root]")?.setAttribute("data-theme", v);
    document.cookie = `${THEME_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
  };

  const OPTIONS: { v: ThemeChoice; label: string }[] = [
    { v: "auto", label: t("themeAuto") },
    { v: "light", label: t("themeLight") },
    { v: "dark", label: t("themeDark") },
  ];
  return (
    <Card title={t("appearanceTitle")} description={t("appearanceHint")}>
      <div role="radiogroup" aria-label={t("appearanceTitle")} className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={choice === o.v}
            onClick={() => pick(o.v)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              choice === o.v ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
