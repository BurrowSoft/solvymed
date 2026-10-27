"use client";

import * as Sentry from "@sentry/nextjs";
import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toMyRequests, type PcMyRequestsFn, type PcPatientPage, PcPreviewFn, PcSelfServeFn, PcSubmitFn } from "@/lib/patientChannel/patientPage";
import { PatientChannelFlow } from "@/components/patientChannel/PatientChannelFlow";

// The patient's Patient Channel on the real practice (M4b): /preview while filling the
// form, /requests on Send, /selfserve on "this answered my question" (§4.7). The page
// carries the vocabulary only; every score is computed on the server.

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function RealChannel({ page, profId }: { page: PcPatientPage; profId: string }) {
  const preview = useMemo<PcPreviewFn>(() => async (reasonId, answers) => {
    const res = await postJson("/api/patient-channel/preview", { profId, reasonId, answers });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, [profId]);

  const submit = useMemo<PcSubmitFn>(() => async (reasonId, answers, replace, shownIds) => {
    const res = await postJson("/api/patient-channel/requests", { profId, reasonId, answers, autoMessagesShown: shownIds, replace });
    if (res.ok) return { status: "sent" };
    // The open request with the same destination (255), named in the prompt (launch polish 2).
    if (res.status === 409) {
      const open = ((await res.json().catch(() => ({}))) as { open?: { reasonTitle?: unknown; createdAt?: unknown } | null }).open;
      return typeof open?.reasonTitle === "string" && typeof open.createdAt === "string"
        ? { status: "open_exists", open: { reasonTitle: open.reasonTitle, createdAt: open.createdAt } }
        : { status: "open_exists" };
    }
    if (res.status === 429) return { status: "rate_limited" };
    const code = ((await res.json().catch(() => ({}))) as { code?: string }).code;
    if (code === "pc_practice_closed" || code === "pc_patient_archived") return { status: "unavailable" };
    return { status: "error" };
  }, [profId]);

  const onSelfServe = useMemo<PcSelfServeFn>(() => (kind) => {
    // A count only; never blocks the patient.
    void postJson("/api/patient-channel/selfserve", { profId, kind }).catch(() => undefined);
  }, [profId]);

  // The patient's requests with this practice (237's pc_my_requests: their own, newest
  // first, never a score): "Suas mensagens" (P-14) and the open one. null on a failed read.
  const loadRequests = useMemo<PcMyRequestsFn>(() => async () => {
    const { data, error } = await createClient().rpc("pc_my_requests", { p_prof: profId });
    // A status this page doesn't know (01): shown as "Recebida", and reported, the code only.
    return error ? null : toMyRequests(data, (status) => Sentry.captureMessage("pc_unknown_request_status", { level: "warning", tags: { status } }));
  }, [profId]);

  return <PatientChannelFlow page={page} preview={preview} submit={submit} onSelfServe={onSelfServe} loadRequests={loadRequests} />;
}
