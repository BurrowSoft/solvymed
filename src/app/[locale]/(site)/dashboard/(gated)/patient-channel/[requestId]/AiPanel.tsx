"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AiStatus } from "@/lib/patientChannel/aiDb";

export type AiPanelLine = { symptomId: string; name: string; quote: string; points: number };

// M7 (specs/patient-channel-m7-plan.md §6): the SolvyAI reading of one request. Each "IA" line
// shows the quoted words and its points; the doctor can Confirmar (the lines stay, marked
// confirmed; the patient's answers are never rewritten) or Desfazer (after a confirm step: the
// keyword score back, the lines deleted). A secretary sees the lines, never the buttons (01).
// No credits, an error or a rules save in between: one line, "keywords only".
export function AiPanel({ requestId, status, lines, confirmedAt, canAct }: {
  requestId: string;
  status: AiStatus;
  lines: AiPanelLine[];
  confirmedAt: string | null;
  canAct: boolean;
}) {
  const t = useTranslations("patientChannel.detail.ai");
  const tLines = useTranslations("patientChannel.lines");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(false);

  if (status === "none") return null;
  if (status === "pending") return <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="pc-ai-pending">{t("pending")}</p>;
  if (status === "no_credits" || status === "failed" || status === "stale") {
    return <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="pc-ai-unavailable">{t("unavailable")}</p>;
  }
  if (status === "undone") return <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="pc-ai-undone">{t("undone")}</p>;

  async function act(action: "confirm" | "undo") {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/patient-channel/requests/${requestId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // 409: already confirmed / undone elsewhere: the reload shows the current state.
      if (res.ok || res.status === 409) {
        setAsking(false);
        router.refresh();
        setBusy(false);
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <section className="mt-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm" data-testid="pc-ai">
      <p className="text-sm font-bold text-slate-900">{t("title")}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500" data-testid="pc-ai-none">{t("none")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-600">{t("intro")}</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {lines.map((l) => (
              <li key={l.symptomId} className="rounded-xl bg-violet-50 p-3" data-testid="pc-ai-line">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 break-words font-semibold text-slate-900">
                    <span className="mr-1 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{tLines("ai")}</span>
                    {l.name}
                  </span>
                  <b className="shrink-0 tabular-nums text-red-700">{l.points > 0 ? `+${l.points}` : l.points}</b>
                </div>
                <p className="mt-1 break-words text-xs italic text-slate-700">&ldquo;{l.quote}&rdquo;</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {confirmedAt && <p className="mt-2 text-xs font-semibold text-teal-700" data-testid="pc-ai-confirmed">{t("confirmed", { date: confirmedAt })}</p>}
      {canAct && lines.length > 0 && (
        asking ? (
          <div className="mt-3" data-testid="pc-ai-undo-ask">
            <p className="text-sm text-slate-800">{t("undoConfirm")}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button type="button" data-testid="pc-ai-undo-yes" disabled={busy} onClick={() => act("undo")}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{t("undo")}</button>
              <button type="button" data-testid="pc-ai-undo-no" disabled={busy} onClick={() => { setAsking(false); setError(false); }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("cancel")}</button>
            </div>
            {/* Below the buttons: an error never moves them (destructive confirms). */}
            {error && <p role="alert" className="error-banner mt-2">{t("error")}</p>}
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              {!confirmedAt && (
                <button type="button" data-testid="pc-ai-confirm" disabled={busy} onClick={() => act("confirm")}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{t("confirm")}</button>
              )}
              <button type="button" data-testid="pc-ai-undo" disabled={busy} onClick={() => { setAsking(true); setError(false); }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("undo")}</button>
            </div>
            {error && <p role="alert" className="error-banner mt-2">{t("error")}</p>}
          </div>
        )
      )}
    </section>
  );
}
