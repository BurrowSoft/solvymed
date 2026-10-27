"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// The ready-made starting template (246's pc_templates, the PO-approved "General / side
// effects", per practice country; 01, 10-27).
// - "start": on blank saved rules, a card above the rules. pc_apply_template writes the
//   template's rules (symptoms, combinations, urgency bands, medicines, automatic
//   messages) and adds its reasons and FAQ.
// - "reset": later, a discreet "Voltar ao modelo inicial" that asks first, then replaces
//   the rules only (p_rules_only, migration 250): the doctor's reasons and FAQ stay.
// Both refuse while a request is open; the page then reloads with the new rules, and after
// a reset says so (item 10): a session flag carries the line across the reload.

const RESTORED = "pc-template-restored";

export function TemplateStart({ templateId }: { templateId: string }) {
  const t = useTranslations("patientChannel.template");
  const { busy, error, apply } = useApply(templateId, false);
  return (
    <section data-testid="pc-template-start" className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-6" aria-labelledby="pc-template">
      <h3 id="pc-template" className="text-base font-bold text-slate-900">{t("start")}</h3>
      <button type="button" disabled={busy} onClick={() => void apply()}
        className="mt-3 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
        {busy ? <span className="flex items-center gap-2"><span className="spinner-white" />{t("use")}</span> : t("use")}
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

export function TemplateReset({ templateId }: { templateId: string }) {
  const t = useTranslations("patientChannel.template");
  const tReasons = useTranslations("patientChannel.reasons");
  const { busy, error, apply } = useApply(templateId, true);
  const [asking, setAsking] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(RESTORED)) { sessionStorage.removeItem(RESTORED); setRestored(true); }
    } catch { /* no storage: no line */ }
  }, []);
  if (!asking) {
    return (
      <>
        {restored && <p role="status" data-testid="pc-template-restored" className="mt-2 rounded-xl border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-900">{t("restored")}</p>}
        <button type="button" data-testid="pc-template-reset" onClick={() => { setRestored(false); setAsking(true); }}
          className="mt-2 block text-xs font-semibold text-slate-500 underline hover:text-slate-700">
          {t("backTo")}
        </button>
      </>
    );
  }
  return (
    <div data-testid="pc-template-confirm" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">{t("confirm")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void apply()}
          className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{t("replace")}</button>
        <button type="button" disabled={busy} onClick={() => setAsking(false)}
          className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50">{tReasons("cancel")}</button>
      </div>
      {/* Below the buttons, so an error never moves them (destructive confirms). */}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

function useApply(templateId: string, rulesOnly: boolean) {
  const t = useTranslations("patientChannel.template");
  const tChannel = useTranslations("patientChannel.channel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc("pc_apply_template", rulesOnly ? { p_template_id: templateId, p_rules_only: true } : { p_template_id: templateId });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message.includes("open_requests_exist") ? t("openRequests") : tChannel("saveError"));
      return;
    }
    // The rules (and on a start, the reasons and FAQ) changed on the server: load them fresh.
    if (rulesOnly) { try { sessionStorage.setItem(RESTORED, "1"); } catch { /* the line is a nicety */ } }
    window.location.reload();
  };
  return { busy, error, apply };
}
