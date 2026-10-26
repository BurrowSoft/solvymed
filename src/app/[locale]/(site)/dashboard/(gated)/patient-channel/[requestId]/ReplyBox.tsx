"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { REPLY_MAX } from "@/lib/patientChannel/inbox";

// The reply (M5): "Responder e encerrar" (answered, with the text) or "Vou ligar para o
// paciente" (call_back, the text optional). One send at a time; the server's answer decides
// (409 not_open: someone closed it meanwhile), then the page reloads its data.
export function ReplyBox({ requestId }: { requestId: string }) {
  const t = useTranslations("patientChannel.detail");
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"notOpen" | "failed" | null>(null);

  async function send(callBack: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patient-channel/requests/${requestId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), callBack }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(res.status === 409 ? "notOpen" : "failed");
    } catch {
      setError("failed");
    }
    setBusy(false);
  }

  const empty = text.trim() === "";
  return (
    <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid="pc-reply">
      <label htmlFor="pc-reply-text" className="text-sm font-bold text-slate-900">{t("replyLabel")}</label>
      <textarea
        id="pc-reply-text"
        data-testid="pc-reply-text"
        value={text}
        maxLength={REPLY_MAX}
        rows={4}
        onChange={(e) => setText(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"
      />
      <p className="text-right text-xs tabular-nums text-slate-500">{text.length}/{REPLY_MAX}</p>
      {error && <p role="alert" className="error-banner mt-2">{t(error)}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          data-testid="pc-reply-send"
          disabled={busy || empty}
          onClick={() => send(false)}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? t("sending") : t("reply")}
        </button>
        <button
          type="button"
          data-testid="pc-reply-call"
          disabled={busy}
          onClick={() => send(true)}
          className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          {t("callBack")}
        </button>
      </div>
    </section>
  );
}
