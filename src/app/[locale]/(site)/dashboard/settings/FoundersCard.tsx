"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { FOUNDER_BUCKET, FOUNDER_MAX_BYTES, FOUNDER_MAX_FILES, contentTypeFor, type FounderUploadError } from "@/lib/foundersUpload";
import { track } from "@/lib/track";

// Settings → Programa Fundadores (founders stage 2, migration 132; UX copy
// "Stage 2"): the accepted founder's instructions, the call link and the
// test-export upload. Doctor only. The file goes straight to the private
// bucket with a signed URL the server issued; then it's registered.

const STEPS = ["step1", "step2", "step3", "step4", "step5"] as const;

export function FoundersCard({ uploadsLeft: initialLeft, bookingUrl }: { uploadsLeft: number; bookingUrl?: string }) {
  const t = useTranslations("foundersCard");
  const [left, setLeft] = useState(initialLeft);
  // The instructions stay open until the first upload.
  const [open, setOpen] = useState(initialLeft >= FOUNDER_MAX_FILES);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const b = { b: (c: React.ReactNode) => <strong>{c}</strong> };

  const errorText = (code: FounderUploadError | string) =>
    code === "not_allowed" ? t("errNotAccepted") : code === "too_many_files" ? t("errLimit") : code === "type" ? t("errType")
      : code === "size" ? t("errSize") : code === "daily_limit" ? t("errDaily") : t("errGeneric");

  async function upload() {
    if (!file || !confirmed || busy) return;
    setMsg(null);
    if (!contentTypeFor(file.name)) { setMsg({ ok: false, text: t("errType") }); return; }
    if (file.size > FOUNDER_MAX_BYTES) { setMsg({ ok: false, text: t("errSize") }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/founders/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, size: file.size, confirmed: true }),
      });
      const signed = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: errorText(signed.code) }); return; }
      const { error } = await createClient().storage.from(FOUNDER_BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: signed.contentType });
      if (error) { setMsg({ ok: false, text: t("errGeneric") }); return; }
      const reg = await fetch("/api/founders/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signed.path, confirmed: true }),
      });
      const done = await reg.json().catch(() => ({}));
      if (!reg.ok) { setMsg({ ok: false, text: errorText(done.code) }); return; }
      track("founders_upload_done", {});
      setLeft((n) => Math.max(0, n - 1));
      setMsg({ ok: true, text: t("success") });
      setOpen(false);
      setFile(null);
      // The re-confirmation is asked again before each file.
      setConfirmed(false);
      if (input.current) input.current.value = "";
    } catch {
      setMsg({ ok: false, text: t("errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="founders" className="scroll-mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t("cardTitle")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("cardIntro")}</p>

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t("howTitle")}</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {STEPS.map((s) => <li key={s}>{t.rich(s, b)}</li>)}
        </ol>
      </details>

      <p className="mt-4 text-sm">
        {bookingUrl
          ? <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline">{t("bookCall")}</a>
          : <span className="text-slate-600">{t("callByEmail")}</span>}
      </p>

      <div className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4">
        <input ref={input} type="file" accept=".csv,.xlsx,.xls,.zip" aria-label={t("upload")}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); }} className="block w-full text-sm" />
        <p className="text-xs text-slate-500">{t("hint")} · {t("left", { n: left })}</p>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>{t("confirm")}</span>
        </label>
        <button type="button" onClick={upload} disabled={!file || !confirmed || busy || left <= 0}
          className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
          {busy ? "…" : t("upload")}
        </button>
        {left <= 0 && !msg && <p className="text-sm text-slate-600">{t("errLimit")}</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-teal-700" : "text-red-600"}`}>{msg.text}</p>}
        <p className="text-xs text-slate-500">{t("retention")}</p>
      </div>
    </div>
  );
}
