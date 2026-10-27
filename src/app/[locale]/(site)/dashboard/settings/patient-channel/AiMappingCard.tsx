"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { aiSetMapping } from "@/lib/patientChannel/aiDb";

// M7: the doctor's "Leitura por IA" switch (pc_settings.ai_mapping, off by default), through
// M7's pc_set_ai_mapping (the column isn't in the doctor's grant), on its own card so the pinned
// settings mapping (channel.ts) stays as it is. Shown only with pc-ai-live or on 237's testers
// allowlist (01 + cf, 10-27); a refused change (outside the testers phase, or before M7 is
// live) goes back, with the error line.
export function AiMappingCard({ initialOn }: { initialOn: boolean }) {
  const t = useTranslations("patientChannel.channel");
  const tAi = useTranslations("patientChannel.detail.ai");
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(false);
    setOn(next);
    try {
      await aiSetMapping(createClient(), next);
    } catch {
      setOn(!next);
      setError(true);
    }
    setBusy(false);
  }

  return (
    <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6" data-testid="pc-ai-mapping">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" data-testid="pc-ai-mapping-toggle" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span><b>{t("aiMapping")}</b><span className="block text-xs leading-relaxed text-slate-500">{t("aiMappingHelp")}</span></span>
      </label>
      {error && <p role="alert" className="error-banner mt-2">{tAi("error")}</p>}
    </section>
  );
}
