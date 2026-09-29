"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// Configurações › SolvyAI (UX 2026-09-29; the app's twin is mobile #99):
// 1) "Mostrar botão do assistente": this browser only, on by default;
// 2) "Permitir que o SolvyAI faça ações": the clinic's opt-in, off by
//    default, asked once before turning on; through migration 115's RPCs,
//    and hidden while they don't exist.

export const BUTTON_HIDDEN_KEY = "solvyai_button_hidden";
export const BUTTON_EVENT = "solvyai-button";
// The tour's "Experimentar agora": open the panel and ask this question
// (detail { text }); the panel tells when it's closed again.
export const OPEN_EVENT = "solvyai-open";
export const CLOSED_EVENT = "solvyai-closed";

export function readButtonHidden(): boolean {
  try { return localStorage.getItem(BUTTON_HIDDEN_KEY) === "1"; } catch { return false; }
}

function writeButtonHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(BUTTON_HIDDEN_KEY, "1");
    else localStorage.removeItem(BUTTON_HIDDEN_KEY);
  } catch {
    // Storage blocked: the switch still works until the page reloads.
  }
  window.dispatchEvent(new CustomEvent(BUTTON_EVENT, { detail: { hidden } }));
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-teal-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function SolvyAiSettingsCard({ prefix }: { prefix: string }) {
  const t = useTranslations("solvyaiSettings");
  const [buttonOn, setButtonOn] = useState(true);
  // null = unknown / not available (before migration 115): the switch hides.
  const [actions, setActions] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setButtonOn(!readButtonHidden());
    let cancelled = false;
    void (async () => {
      const { data, error: e } = await createClient().rpc("assistant_usage_today");
      if (cancelled || e || !data || typeof data !== "object" || "reason" in data) return;
      setActions((data as { actions?: boolean }).actions === true);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveActions = async (enabled: boolean) => {
    setSaving(true);
    setError(false);
    const { error: e } = await createClient().rpc("set_solvyai_actions", { p_enabled: enabled });
    setSaving(false);
    setAsking(false);
    if (e) { setError(true); return; }
    setActions(enabled);
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">{t("buttonLabel")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("buttonHint")}</p>
        </div>
        <Switch checked={buttonOn} label={t("buttonLabel")} onChange={(v) => { setButtonOn(v); writeButtonHidden(!v); }} />
      </div>

      {actions !== null && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{t("actionsLabel")}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {t("actionsText")}{" "}
                <a href={`${prefix}/privacy`} className="font-semibold text-teal-700 underline">{t("privacy")}</a>
              </p>
            </div>
            <Switch
              checked={actions}
              disabled={saving}
              label={t("actionsLabel")}
              // Turning it on asks once (UX); turning it off doesn't.
              onChange={(v) => { if (v) setAsking(true); else void saveActions(false); }}
            />
          </div>
          {asking && (
            <div role="alertdialog" aria-label={t("confirmTitle")} className="mt-3 rounded-xl bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">{t("confirmTitle")}</p>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white">{t("cancel")}</button>
                <button type="button" disabled={saving} onClick={() => void saveActions(true)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{t("turnOn")}</button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{t("error")}</p>}
        </div>
      )}
    </div>
  );
}
