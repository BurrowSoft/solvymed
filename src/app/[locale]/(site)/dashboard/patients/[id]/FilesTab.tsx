"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { formatShortDate } from "@/lib/dateLabels";
import {
  BUCKET, MAX_UPLOAD_BYTES, folderFor, isFileDeletable, safeFileName, withCounter,
  type FileKind, type PatientFile,
} from "@/lib/patientFiles";
import { deletePatientFile, hidePatientFile, listPatientFiles, openPatientFile } from "../files-actions";

// Exams / Files tab (Help P7): photos or PDFs, private. Upload goes from the
// browser to storage under the doctor's own folder; a name already taken
// gets " (2)", never an overwrite. Opening makes a short-lived link (and an
// access-log entry). Within 24 h of upload a file can be deleted; after
// that it's hidden, with a reason, like the app.
const ACCEPT = "image/*,application/pdf";

export function FilesTab({ patientId, doctorId, kind, isArchived, locale }: {
  patientId: string; doctorId: string; kind: FileKind; isArchived: boolean; locale: string;
}) {
  const t = useTranslations("patientDetail");
  const [files, setFiles] = useState<PatientFile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [hiding, setHiding] = useState<PatientFile | null>(null);
  const [reason, setReason] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await listPatientFiles(patientId, kind);
    if (r.ok) setFiles(r.data); else { setFiles([]); setError(t("filesError")); }
  }, [patientId, kind, t]);
  useEffect(() => { setFiles(null); setError(""); void load(); }, [load]);

  async function upload(file: File) {
    setError("");
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) { setError(t("filesTypeError")); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError(t("filesTooLarge")); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const folder = folderFor(doctorId, patientId, kind);
      const base = safeFileName(file.name);
      // Never overwrite: a taken name gets a counter.
      for (let n = 1; n <= 20; n++) {
        const name = n === 1 ? base : withCounter(base, n);
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(`${folder}/${name}`, file, { upsert: false, contentType: file.type });
        if (!upErr) { await load(); return; }
        const taken = /exists|duplicate/i.test(upErr.message ?? "") || (upErr as { statusCode?: string }).statusCode === "409";
        if (!taken) { setError(t("filesError")); return; }
      }
      setError(t("filesError"));
    } catch {
      setError(t("filesError"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(f: PatientFile) {
    // Opened synchronously so the browser doesn't block it as a pop-up.
    // Not with "noopener": then window.open returns null and the file
    // would replace this page. The opener is cut by hand instead.
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    const r = await openPatientFile(patientId, f.path);
    if (!r.ok) { win?.close(); setError(r.code === "access_log_failed" ? t("filesAccessLogFailed") : t("filesError")); return; }
    // Pop-ups blocked: never navigate away from the patient; say so.
    if (win) win.location.href = r.data;
    else setError(t("filesPopupBlocked"));
  }

  async function remove(f: PatientFile) {
    setError("");
    if (isFileDeletable(f.createdAt)) {
      if (!window.confirm(t("filesDeleteConfirm"))) return;
      setBusy(true);
      const r = await deletePatientFile(patientId, f.path, f.createdAt);
      setBusy(false);
      // The window closed in between: hide it instead.
      if (!r.ok && r.code === "delete_window_passed") { setHiding(f); setReason(""); return; }
      if (!r.ok) { setError(t("filesError")); return; }
      await load();
    } else {
      setHiding(f); setReason("");
    }
  }

  async function confirmHide() {
    if (!hiding) return;
    if (!reason.trim()) { setError(t("reasonRequired")); return; }
    setBusy(true);
    const r = await hidePatientFile(patientId, hiding.path, reason);
    setBusy(false);
    if (!r.ok) { setError(r.code === "reason_required" ? t("reasonRequired") : t("filesError")); return; }
    setHiding(null);
    await load();
  }

  const visible = (files ?? []).filter((f) => !f.hidden);
  const removed = (files ?? []).filter((f) => f.hidden);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("filesHint")}</p>
        {!isArchived && (
          <>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-label={t("filesUpload")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
              {busy ? t("filesUploading") : t("filesUpload")}
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {files === null ? (
        <p className="text-sm text-slate-400">…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">{kind === "exams" ? t("filesEmptyExams") : t("filesEmptyFiles")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
          {visible.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{f.name}</p>
                <p className="text-xs text-slate-400">{formatShortDate(locale, f.createdAt.slice(0, 10))}{f.size ? ` · ${Math.max(1, Math.round(f.size / 1024))} KB` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => void open(f)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">{t("filesOpen")}</button>
                {!isArchived && (
                  <button type="button" disabled={busy} onClick={() => void remove(f)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">{t("filesRemove")}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowRemoved((v) => !v)} className="text-xs font-semibold text-slate-500 underline">
            {t("filesShowRemoved", { n: removed.length })}
          </button>
          {showRemoved && (
            <ul className="mt-2 space-y-1">
              {removed.map((f) => (
                <li key={f.path} className="text-xs text-slate-400">
                  <span className="font-semibold line-through">{f.name}</span>{" "}
                  {t("filesHiddenLine", { date: formatShortDate(locale, f.hidden!.at.slice(0, 10)), name: f.hidden!.byName ?? "—", reason: f.hidden!.reason })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hiding && (
        <div role="dialog" aria-label={t("filesHideTitle")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-slate-900">{t("filesHideTitle")}: {hiding.name}</p>
          <p className="mt-1 text-slate-600">{t("filesHideHint")}</p>
          <label className="mt-3 block font-semibold text-slate-700">{t("filesHideReason")}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setHiding(null)} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 font-semibold text-slate-600">{t("cancel")}</button>
            <button type="button" disabled={busy} onClick={() => void confirmHide()} className="flex-1 rounded-xl bg-teal-600 py-2 font-bold text-white disabled:opacity-60">{t("filesRemove")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
