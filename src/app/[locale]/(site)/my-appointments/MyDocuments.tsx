"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { formatShortDate } from "@/lib/dateLabels";
import { BUCKET } from "@/lib/patientFiles";
import { DOC_ACCEPT, DOC_MAX_BYTES, DOC_TITLE_MAX, defaultTitle, docMime, formatBytes, localDay, type DocErrorKey } from "@/lib/patientDocuments";
import { finishUpload, loadMyDocuments, openMyDocument, removeMyUpload, startUpload, type DocDoctor, type MyDocFolder } from "./document-actions";

// Minhas consultas → Documents (1.8.0 A; flag 'patient_documents'; the app's
// MyDocumentsModal): per doctor, the folders they share and the documents
// in them, the patient's own uploads included; "Send a document" into a
// folder that takes uploads; an own upload can be removed until the doctor
// opens it (within 24 h). Only while connected to that doctor (190).

type Send = { file: File; title: string; folderId: string };

export function MyDocuments({ doctors }: { doctors: DocDoctor[] }) {
  const t = useTranslations("docs");
  const tp = useTranslations("patientDetail");
  const locale = useLocale();
  const [openId, setOpenId] = useState<string | null>(doctors.length === 1 ? doctors[0].professionalId : null);
  const [folders, setFolders] = useState<Record<string, MyDocFolder[] | "failed">>({});
  const [send, setSend] = useState<Send | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const errText = (k: DocErrorKey) =>
    k === "tooLarge" || k === "type" || k === "dailyLimit" || k === "patientFull" || k === "storageFull" || k === "noAccess" ? t(`err.${k}`) : tp("filesError");
  const folderName = (f: MyDocFolder) => f.name ?? (f.defaultKey ? t(`folder.${f.defaultKey}` as "folder.start") : "");

  async function load(id: string) {
    const r = await loadMyDocuments(id);
    setFolders((m) => ({ ...m, [id]: r.ok ? r.data : "failed" }));
  }
  function toggle(id: string) {
    setMsg(null); setSend(null);
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!folders[id]) void load(id);
  }
  // A single doctor opens by itself.
  useEffect(() => { if (doctors.length === 1) void load(doctors[0].professionalId); }, [doctors]);

  async function open(id: string) {
    // Opened synchronously so the browser doesn't block it as a pop-up.
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    const r = await openMyDocument(id);
    if (!r.ok) { win?.close(); setMsg({ ok: false, text: errText(r.code) }); return; }
    if (win) win.location.href = r.data; else setMsg({ ok: false, text: tp("filesPopupBlocked") });
  }

  function pick(file: File, uploadFolders: MyDocFolder[]) {
    setMsg(null);
    if (!docMime(file)) { setMsg({ ok: false, text: t("err.type") }); return; }
    if (file.size > DOC_MAX_BYTES) { setMsg({ ok: false, text: t("err.tooLarge") }); return; }
    setSend({ file, title: defaultTitle(file.name), folderId: uploadFolders[0].id });
  }

  async function doSend(d: DocDoctor) {
    if (!send) return;
    const mime = docMime(send.file);
    if (!mime || !send.title.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const s = await startUpload({ professionalId: d.professionalId, folderId: send.folderId, title: send.title, mime, size: send.file.size });
      if (!s.ok) { setMsg({ ok: false, text: errText(s.code) }); return; }
      // A re-typed Blob, as the doctor's upload: a .heic often comes with no type (53).
      const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(s.data.path, s.data.token, send.file.slice(0, send.file.size, mime), { contentType: mime });
      if (error) { setMsg({ ok: false, text: tp("filesError") }); return; }
      const f = await finishUpload(s.data.documentId);
      if (!f.ok) { setMsg({ ok: false, text: errText(f.code) }); return; }
      setSend(null);
      setMsg({ ok: true, text: t("uploadDone", { doctor: d.doctor }) });
      await load(d.professionalId);
    } catch {
      setMsg({ ok: false, text: tp("filesError") });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(docId: string, profId: string) {
    if (!window.confirm(t("removeUploadConfirm"))) return;
    setBusy(true); setMsg(null);
    const r = await removeMyUpload(docId);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: errText(r.code) }); return; }
    await load(profId);
  }

  return (
    <section id="my-documents" data-testid="my-documents" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{t("tab")}</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {doctors.map((d) => {
          const list = folders[d.professionalId];
          const isOpen = openId === d.professionalId;
          const uploadFolders = Array.isArray(list) ? list.filter((f) => f.canUpload) : [];
          const docsCount = Array.isArray(list) ? list.reduce((n, f) => n + f.documents.length, 0) : d.documentCount;
          return (
            <li key={d.professionalId} className="py-3">
              <button type="button" onClick={() => toggle(d.professionalId)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="truncate text-sm font-semibold text-slate-900">{d.doctor}</span>
                <span className="shrink-0 text-xs text-slate-500">{docsCount} {isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div className="mt-3 space-y-4">
                  {list === undefined ? (
                    <p className="text-sm text-slate-400">…</p>
                  ) : list === "failed" ? (
                    <p className="text-sm text-red-600">{tp("filesError")}</p>
                  ) : (
                    <>
                      {docsCount === 0 && <p className="text-sm text-slate-500">{t("patientEmpty")}</p>}
                      {list.filter((f) => f.documents.length > 0).map((f) => (
                        <div key={f.id} role="group" aria-label={folderName(f)}>
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{folderName(f)}</p>
                          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                            {f.documents.map((doc) => (
                              <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-800">{doc.title}</p>
                                  <p className="text-xs text-slate-400">
                                    {doc.corrected ? t("correctedOn", { date: formatShortDate(locale, localDay(doc.createdAt)) }) : formatShortDate(locale, localDay(doc.createdAt))}
                                    {" · "}{formatBytes(doc.sizeBytes)}
                                    {doc.sentByMe && <> · {t("sentByYou")}</>}
                                  </p>
                                  {doc.canRemove && <p className="text-xs text-slate-500">{t("removeUploadHint")}</p>}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button type="button" onClick={() => void open(doc.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">{t("open")}</button>
                                  {doc.canRemove && (
                                    <button type="button" disabled={busy} onClick={() => void remove(doc.id, d.professionalId)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">{t("removeUpload")}</button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {uploadFolders.length > 0 && (
                        send ? (
                          <div role="dialog" aria-label={t("upload")} className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                            <p className="truncate text-xs text-slate-500">{send.file.name} · {formatBytes(send.file.size)}</p>
                            <label className="block text-sm font-semibold text-slate-700">{t("titleLabel")}
                              <input value={send.title} maxLength={DOC_TITLE_MAX} onChange={(e) => setSend({ ...send, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            </label>
                            {uploadFolders.length > 1 && (
                              <label className="block text-sm font-semibold text-slate-700">{t("uploadFolder")}
                                <select value={send.folderId} onChange={(e) => setSend({ ...send, folderId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                  {uploadFolders.map((f) => <option key={f.id} value={f.id}>{folderName(f)}</option>)}
                                </select>
                              </label>
                            )}
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { setSend(null); if (input.current) input.current.value = ""; }} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">{tp("cancel")}</button>
                              <button type="button" disabled={busy || !send.title.trim()} onClick={() => void doSend(d)} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white disabled:opacity-60">
                                {busy ? tp("filesUploading") : t("upload")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <input ref={input} type="file" accept={DOC_ACCEPT} className="hidden" aria-label={t("upload")} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, uploadFolders); }} />
                            <button type="button" onClick={() => input.current?.click()} className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">{t("upload")}</button>
                            <p className="mt-1 text-xs text-slate-500">{t("uploadHint")}</p>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-teal-700" : "text-red-600"}`}>{msg.text}</p>}
    </section>
  );
}
