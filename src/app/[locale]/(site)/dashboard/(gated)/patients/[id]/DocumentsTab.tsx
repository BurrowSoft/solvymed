"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { formatShortDate } from "@/lib/dateLabels";
import { BUCKET } from "@/lib/patientFiles";
import {
  DOC_ACCEPT, DOC_MAX_BYTES, DOC_TITLE_MAX, canDeleteOwn, defaultTitle, docMime, docPath, formatBytes, localDay,
  type DocErrorKey, type DocFolder, type PatientDocument,
} from "@/lib/patientDocuments";
import {
  deleteOwnDocument, hideDocument, loadPatientDocuments, moveDocument, openDocument, registerDocument,
  renameDocument, setDocumentShared,
} from "../documents-actions";

// The patient's Documents (1.8.0 A; flag 'patient_documents'): replaces
// Exams + Files while the flag is on (the app's PatientDocuments). Every
// document sits in one of the doctor's folders; a shared one is visible to
// the connected patient, Internal never is. Upload: the browser stores the
// file at <doctor>/<patient>/<uuid>.<ext>, then 190 registers it. Remove:
// the doctor's own upload within 24 h is deleted; anything else is hidden
// with a reason (097), from the patient too.

type Upload = { file: File; title: string; folderId: string; shared: boolean };

export function DocumentsTab({ patientId, doctorId, isArchived, locale }: {
  patientId: string; doctorId: string; isArchived: boolean; locale: string;
}) {
  const t = useTranslations("docs");
  const tp = useTranslations("patientDetail");
  const [folders, setFolders] = useState<DocFolder[] | null>(null);
  const [docs, setDocs] = useState<PatientDocument[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [hiding, setHiding] = useState<PatientDocument | null>(null);
  const [reason, setReason] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const folderName = useCallback((f: DocFolder) => f.name ?? (f.defaultKey ? t(`folder.${f.defaultKey}`) : ""), [t]);
  const errText = useCallback((k: DocErrorKey) => {
    switch (k) {
      case "tooLarge": case "type": case "cantShareType": case "dailyLimit": case "patientFull": case "storageFull": case "ownStorageFull": case "noAccess":
        return t(`err.${k}`);
      default: return tp("filesError");
    }
  }, [t, tp]);

  const load = useCallback(async () => {
    const r = await loadPatientDocuments(patientId);
    if (!r.ok) { setFolders([]); setError(errText(r.code)); return; }
    setFolders(r.data.folders);
    setDocs(r.data.documents);
  }, [patientId, errText]);
  useEffect(() => { setFolders(null); setError(""); void load(); }, [load]);

  const isInternal = (folderId: string) => folders?.find((f) => f.id === folderId)?.defaultKey === "internal";

  function pick(file: File) {
    setError("");
    if (!docMime(file)) { setError(t("err.type")); return; }
    if (file.size > DOC_MAX_BYTES) { setError(t("err.tooLarge")); return; }
    // The first shared folder that isn't "Start here" is a guess; the doctor picks.
    const first = folders?.[0];
    if (!first) return;
    setUpload({ file, title: defaultTitle(file.name), folderId: first.id, shared: first.shared && first.defaultKey !== "internal" });
  }

  async function saveUpload() {
    if (!upload) return;
    const mime = docMime(upload.file);
    if (!mime || !upload.title.trim()) return;
    setBusy(true); setError("");
    try {
      const id = crypto.randomUUID();
      const path = docPath(doctorId, patientId, id, mime);
      const supabase = createClient();
      // A re-typed Blob: storage-js sends a File as multipart and the stored
      // type is the part's own, which is "" for a .heic in most browsers (53);
      // 190 checks it against the extension.
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, upload.file.slice(0, upload.file.size, mime), { upsert: false, contentType: mime });
      if (upErr) { setError(/storage_full/.test(upErr.message ?? "") ? t("err.ownStorageFull") : tp("filesError")); return; }
      const r = await registerDocument(patientId, { path, folderId: upload.folderId, title: upload.title, shared: upload.shared && !isInternal(upload.folderId) });
      if (!r.ok) { setError(errText(r.code)); return; }
      setUpload(null);
      await load();
    } catch {
      setError(tp("filesError"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(d: PatientDocument) {
    // Opened synchronously so the browser doesn't block it as a pop-up
    // (FilesTab's pattern; the opener is cut by hand).
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    const r = await openDocument(d.id);
    if (!r.ok) { win?.close(); setError(errText(r.code)); return; }
    if (win) win.location.href = r.data; else setError(tp("filesPopupBlocked"));
    // The first doctor open stamps doctor_opened_at (the patient can't remove it anymore).
    if (d.uploadedByRole === "patient" && !d.doctorOpenedAt) void load();
  }

  // On success the list changes at once (apply) and reloads behind it: the
  // list call can take seconds (53).
  async function act(p: Promise<{ ok: boolean; code?: DocErrorKey }>, apply?: (ds: PatientDocument[]) => PatientDocument[]) {
    setBusy(true); setError("");
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(errText((r as { code: DocErrorKey }).code)); return false; }
    if (apply) setDocs(apply);
    void load();
    return true;
  }
  const patchDoc = (id: string, change: Partial<PatientDocument>) => (ds: PatientDocument[]) => ds.map((x) => (x.id === id ? { ...x, ...change } : x));

  async function remove(d: PatientDocument) {
    if (canDeleteOwn(d)) {
      if (!window.confirm(tp("filesDeleteConfirm"))) return;
      setBusy(true);
      const r = await deleteOwnDocument(d.storagePath, patientId);
      setBusy(false);
      // The window closed in between: hide it instead.
      if (!r.ok) { setHiding(d); setReason(""); return; }
      setDocs((ds) => ds.filter((x) => x.id !== d.id));
      void load();
    } else {
      setHiding(d); setReason("");
    }
  }

  async function confirmHide() {
    if (!hiding) return;
    if (!reason.trim()) { setError(tp("reasonRequired")); return; }
    const h = hiding;
    if (await act(hideDocument(h.storagePath, patientId, reason), patchDoc(h.id, { hidden: { at: new Date().toISOString(), byName: null, reason: reason.trim() } }))) setHiding(null);
  }

  async function saveRename() {
    if (!renaming || !renaming.title.trim()) return;
    if (await act(renameDocument(renaming.id, renaming.title), patchDoc(renaming.id, { title: renaming.title.trim() }))) setRenaming(null);
  }

  const visible = docs.filter((d) => !d.hidden);
  const removed = docs.filter((d) => d.hidden);
  const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  return (
    <div className="space-y-4" data-testid="documents-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("uploadHint")}</p>
        {!isArchived && folders && folders.length > 0 && (
          <>
            <input ref={input} type="file" accept={DOC_ACCEPT} className="hidden" aria-label={tp("filesUpload")} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
              {busy ? tp("filesUploading") : tp("filesUpload")}
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {upload && folders && (
        <div role="dialog" aria-label={tp("filesUpload")} className="space-y-3 rounded-2xl border border-teal-100 bg-teal-50/40 p-4">
          <p className="truncate text-xs text-slate-500">{upload.file.name} · {formatBytes(upload.file.size)}</p>
          <label className="block text-sm font-semibold text-slate-700">{t("titleLabel")}
            <input value={upload.title} maxLength={DOC_TITLE_MAX} onChange={(e) => setUpload({ ...upload, title: e.target.value })} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">{t("uploadFolder")}
            <select value={upload.folderId} onChange={(e) => {
              const f = folders.find((x) => x.id === e.target.value);
              setUpload({ ...upload, folderId: e.target.value, shared: !!f && f.shared && f.defaultKey !== "internal" });
            }} className={`mt-1 ${inputClass} bg-white`}>
              {folders.map((f) => <option key={f.id} value={f.id}>{folderName(f)}</option>)}
            </select>
          </label>
          {isInternal(upload.folderId) ? (
            <p className="text-xs text-slate-500">{t("internalNote")}</p>
          ) : (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={upload.shared} onChange={(e) => setUpload({ ...upload, shared: e.target.checked })} className="h-4 w-4 accent-teal-600" />
              {t("share")}
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setUpload(null); if (input.current) input.current.value = ""; }} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">{tp("cancel")}</button>
            <button type="button" disabled={busy || !upload.title.trim()} onClick={() => void saveUpload()} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white disabled:opacity-60">
              {busy ? tp("filesUploading") : tp("filesUpload")}
            </button>
          </div>
        </div>
      )}

      {folders === null ? (
        <p className="text-sm text-slate-400">…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      ) : (
        folders.filter((f) => visible.some((d) => d.folderId === f.id)).map((f) => (
          <section key={f.id} aria-label={folderName(f)}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{folderName(f)}</h3>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
              {visible.filter((d) => d.folderId === f.id).map((d) => (
                <li key={d.id} className={`space-y-2 px-4 py-3 ${d.replaced ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {renaming?.id === d.id ? (
                        <div className="flex gap-2">
                          <input aria-label={t("titleLabel")} value={renaming.title} maxLength={DOC_TITLE_MAX} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} className={inputClass} />
                          <button type="button" disabled={busy} onClick={() => void saveRename()} className="rounded-lg bg-teal-600 px-3 text-xs font-bold text-white">{tp("saveChanges")}</button>
                          <button type="button" onClick={() => setRenaming(null)} className="rounded-lg px-2 text-xs text-slate-500">{tp("cancel")}</button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-semibold text-slate-800">{d.title}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        {formatShortDate(locale, localDay(d.createdAt))} · {formatBytes(d.sizeBytes)}
                        {d.uploadedByRole === "patient" && <> · <span className="font-semibold text-amber-700">{t("uploadedByPatient")}</span></>}
                        {d.replaced && <> · {t("corrected")}</>}
                      </p>
                      {f.defaultKey !== "internal" && (
                        <p className={`text-xs ${d.shared ? "text-teal-700" : "text-slate-500"}`}>{d.shared ? t("shared") : t("notShared")}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => void open(d)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">{t("open")}</button>
                  </div>
                  {!isArchived && renaming?.id !== d.id && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {f.defaultKey !== "internal" && !d.replaced && (
                        <button type="button" disabled={busy} onClick={() => void act(setDocumentShared(d.id, !d.shared), patchDoc(d.id, { shared: !d.shared }))} className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">
                          {d.shared ? t("hideFromPatient") : t("share")}
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => setRenaming({ id: d.id, title: d.title })} className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">{t("settings.rename")}</button>
                      <label className="flex items-center gap-1 text-slate-500">
                        <span className="sr-only">{t("move")}</span>
                        <select aria-label={t("move")} value="" disabled={busy} onChange={(e) => { const to = e.target.value; if (to) void act(moveDocument(d.id, to), patchDoc(d.id, { folderId: to, ...(isInternal(to) ? { shared: false } : {}) })); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                          <option value="">{t("move")}</option>
                          {folders.filter((x) => x.id !== d.folderId).map((x) => <option key={x.id} value={x.id}>{folderName(x)}</option>)}
                        </select>
                      </label>
                      <button type="button" disabled={busy} onClick={() => void remove(d)} className="rounded-lg px-2 py-1 font-semibold text-slate-500 hover:bg-slate-50">{tp("filesRemove")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {removed.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowRemoved((v) => !v)} className="text-xs font-semibold text-slate-500 underline">
            {tp("filesShowRemoved", { n: removed.length })}
          </button>
          {showRemoved && (
            <ul className="mt-2 space-y-1">
              {removed.map((d) => (
                <li key={d.id} className="text-xs text-slate-400">
                  <span className="font-semibold line-through">{d.title}</span>{" "}
                  {tp("filesHiddenLine", { date: formatShortDate(locale, localDay(d.hidden!.at)), name: d.hidden!.byName ?? "—", reason: d.hidden!.reason })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hiding && (
        <div role="dialog" aria-label={tp("filesHideTitle")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-slate-900">{tp("filesHideTitle")}: {hiding.title}</p>
          {/* "24 hours have passed" is only true of the doctor's own upload. */}
          {hiding.source === "doctor_upload" && <p className="mt-1 text-slate-600">{tp("filesHideHint")}</p>}
          <label className="mt-3 block font-semibold text-slate-700">{tp("filesHideReason")}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setHiding(null)} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 font-semibold text-slate-600">{tp("cancel")}</button>
            <button type="button" disabled={busy} onClick={() => void confirmHide()} className="flex-1 rounded-xl bg-teal-600 py-2 font-bold text-white disabled:opacity-60">{tp("filesRemove")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
