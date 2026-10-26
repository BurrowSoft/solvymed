"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// The ready-made starting template (246's pc_templates, the PO-approved "General / side
// effects", per practice country; 01, 10-27): while the doctor has no symptoms yet, a card
// above the rules offers it. pc_apply_template (237 §7j) writes the template's rules
// (symptoms, combinations, urgency bands, medicines, automatic messages) and adds its
// reasons and FAQ; it refuses while a request is open. The page then reloads with them.

export function TemplateStart({ templateId }: { templateId: string }) {
  const t = useTranslations("patientChannel.template");
  const tChannel = useTranslations("patientChannel.channel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc("pc_apply_template", { p_template_id: templateId });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message.includes("open_requests_exist") ? t("openRequests") : tChannel("saveError"));
      return;
    }
    // The rules, reasons and FAQ all changed on the server: load them fresh.
    window.location.reload();
  };

  return (
    <section data-testid="pc-template-start" className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-6" aria-labelledby="pc-template">
      <h3 id="pc-template" className="text-base font-bold text-slate-900">{t("start")}</h3>
      <button type="button" disabled={busy} onClick={() => void apply()}
        className="mt-3 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
        {busy ? <span className="flex items-center gap-2"><span className="spinner-white" />{t("use")}</span> : t("use")}
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
