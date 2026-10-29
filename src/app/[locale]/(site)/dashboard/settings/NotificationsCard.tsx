"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toTipsPrefs, type TipsPrefs } from "@/lib/tips";
import { Card } from "./SettingsClient";

// Configurações → "Notificações" (the re-engagement contract §3, cf MUST 2: named exactly as
// the privacy text says): "Dicas e lembretes do SolvyMed", two switches (push / e-mail),
// 276's tips_prefs_get / tips_prefs_set for the signed-in doctor. A change is shown at once
// and rolled back with the error when the save fails. The app has the same two switches.
export function NotificationsCard() {
  const t = useTranslations("notificationsSettings");
  const [prefs, setPrefs] = useState<TipsPrefs | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void createClient().rpc("tips_prefs_get").then(({ data, error: e }) => {
      if (!live) return;
      if (e) setError(t("loadError"));
      else setPrefs(toTipsPrefs(data));
    }, () => live && setError(t("loadError")));
    return () => {
      live = false;
    };
  }, [t]);

  async function toggle(key: keyof TipsPrefs) {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setError("");
    const { data, error: e } = await createClient()
      .rpc("tips_prefs_set", key === "push" ? { p_push: next.push, p_email: null } : { p_push: null, p_email: next.email })
      .then((r) => r, () => ({ data: null, error: { message: "network" } }));
    if (e) {
      setPrefs(before);
      setError(t("saveError"));
      return;
    }
    setPrefs(toTipsPrefs(data));
  }

  return (
    <Card id="notifications" title={t("title")}>
      <div data-testid="tips-prefs">
        <h3 className="text-sm font-bold text-slate-900">{t("tipsTitle")}</h3>
        <p className="mb-3 text-sm text-slate-500">{t("tipsHint")}</p>
        {/* The same track/knob switch as "Notificações por médico" (NotifyPrefsCard; 01). */}
        {(["push", "email"] as const).map((key) => {
          const on = prefs?.[key] ?? true;
          return (
            <div key={key} className="flex items-center justify-between gap-3 py-2">
              <span id={`tips-${key}-label`} className="text-sm text-slate-800">{t(key)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`tips-${key}-label`}
                data-testid={`tips-${key}`}
                disabled={!prefs}
                onClick={() => void toggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-teal-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
