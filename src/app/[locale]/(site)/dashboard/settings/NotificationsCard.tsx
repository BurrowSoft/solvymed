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
        {(["push", "email"] as const).map((key) => (
          <label key={key} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-slate-800">{t(key)}</span>
            <input
              type="checkbox"
              role="switch"
              data-testid={`tips-${key}`}
              className="h-5 w-9 cursor-pointer accent-teal-600"
              checked={prefs?.[key] ?? true}
              disabled={!prefs}
              onChange={() => void toggle(key)}
            />
          </label>
        ))}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
