"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MASS_BODY_MAX, MASS_TITLE_MAX } from "@/lib/massMessage";
import { sendMassMessage } from "./mass-actions";

// "Enviar para Pacientes" on the doctor's Home (the app's broadcast, 1.6.0,
// behind liveFeatures.broadcast): a title and a message to every patient
// account of the practice. Send stays off while either is empty (cf: a
// blank message is refused by the server too, 172).
export function MassMessageButton() {
  const t = useTranslations("massMessage");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState({ title: false, body: false });
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const titleEmpty = !title.trim();
  const bodyEmpty = !body.trim();

  function close() {
    setOpen(false);
    setTitle("");
    setBody("");
    setTouched({ title: false, body: false });
    setResult(null);
  }

  function send() {
    setTouched({ title: true, body: true });
    if (titleEmpty || bodyEmpty) return;
    setResult(null);
    start(async () => {
      const r = await sendMassMessage(title, body);
      if (r.ok) {
        setResult({ kind: "ok", text: r.queued > 0 ? t("sent", { n: r.queued }) : t("noTokens") });
        setTitle("");
        setBody("");
        setTouched({ title: false, body: false });
      } else {
        setResult({ kind: "error", text: t(r.code) });
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
        {t("title")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
          <div role="dialog" aria-modal="true" aria-labelledby="mass-title" className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 id="mass-title" className="text-lg font-bold text-slate-900">{t("title")}</h3>
              <button type="button" onClick={close} aria-label={t("close")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("selectAll")}</p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t("notifTitle")}</span>
                <input
                  value={title}
                  maxLength={MASS_TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTouched((x) => ({ ...x, title: true }))}
                  placeholder={t("notifTitlePlaceholder")}
                  aria-invalid={touched.title && titleEmpty}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
                />
                {touched.title && titleEmpty && <span className="mt-1 block text-xs text-red-600">{t("titleRequired")}</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t("notifBody")}</span>
                <textarea
                  value={body}
                  maxLength={MASS_BODY_MAX}
                  rows={4}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => setTouched((x) => ({ ...x, body: true }))}
                  placeholder={t("notifBodyPlaceholder")}
                  aria-invalid={touched.body && bodyEmpty}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
                />
                {touched.body && bodyEmpty && <span className="mt-1 block text-xs text-red-600">{t("bodyRequired")}</span>}
                <span className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>{t("noPatientDetails")}</span>
                  <span>{body.length}/{MASS_BODY_MAX}</span>
                </span>
              </label>
              {result && (
                <p role="status" className={`rounded-xl px-3 py-2 text-sm ${result.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{result.text}</p>
              )}
              <button
                type="button"
                onClick={send}
                disabled={pending || titleEmpty || bodyEmpty}
                className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {pending ? "…" : t("send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
