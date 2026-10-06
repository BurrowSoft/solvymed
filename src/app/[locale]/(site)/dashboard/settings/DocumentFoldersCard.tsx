"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FOLDER_NAME_MAX, FOLDERS_MAX, STORAGE_NOTICE_RATIO, formatBytes, type DocErrorKey, type DocFolder } from "@/lib/patientDocuments";
import { countFolderShared, deleteFolder, loadFolders, reorderFolders, saveFolder } from "../(gated)/patients/documents-actions";

// Settings → Document folders (1.8.0 A; doctors only, flag
// 'patient_documents'; the app's DocumentFoldersModal). The folders apply
// to every patient. Internal is always internal (never shared, no uploads);
// defaults can be renamed and reordered, never deleted; a custom folder can
// be deleted only when empty. Turning "Visible to patients" off hides the
// folder's shared documents (no push), after a confirm with the count.

export function DocumentFoldersCard({ initial, usedBytes, limitBytes, loadFailed }: {
  initial: DocFolder[]; usedBytes: number; limitBytes: number; loadFailed: boolean;
}) {
  const t = useTranslations("docs");
  const tr = useTranslations("recordTemplates");
  const tp = useTranslations("patientDetail");
  const [folders, setFolders] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; name: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();

  const nameOf = (f: DocFolder) => f.name ?? (f.defaultKey ? t(`folder.${f.defaultKey}`) : "");
  const errText = (k: DocErrorKey) =>
    k === "folderNotEmpty" ? t("settings.deleteEmptyOnly") : k === "maxFolders" ? t("settings.max") : tp("filesError");

  async function reload() {
    const r = await loadFolders();
    if (r.ok) setFolders(r.data.folders);
  }

  function run(fn: () => Promise<{ ok: boolean; code?: DocErrorKey }>) {
    setMsg("");
    start(async () => {
      const r = await fn();
      if (!r.ok) { setMsg(errText((r as { code: DocErrorKey }).code)); return; }
      await reload();
    });
  }

  function toggleShared(f: DocFolder, on: boolean) {
    setMsg("");
    start(async () => {
      if (!on) {
        const n = await countFolderShared(f.id);
        if (n && n > 0 && !window.confirm(t("settings.offConfirm", { count: n }))) return;
      }
      const r = await saveFolder(f.id, { name: f.name, shared: on, patientCanUpload: on && f.patientCanUpload });
      if (!r.ok) { setMsg(errText(r.code)); return; }
      await reload();
    });
  }

  function saveName() {
    if (!editing) return;
    const name = editing.name.trim().slice(0, FOLDER_NAME_MAX);
    if (!name) return;
    const f = editing.id ? folders.find((x) => x.id === editing.id) : null;
    run(async () => {
      // A new folder: visible to patients, no uploads (the doctor turns them on).
      const r = await saveFolder(editing.id, { name, shared: f ? f.shared : true, patientCanUpload: f ? f.patientCanUpload : false });
      if (r.ok) setEditing(null);
      return r;
    });
  }

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= folders.length) return;
    const next = folders.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setFolders(next);
    run(() => reorderFolders(next.map((f) => f.id)));
  }

  const showStorage = limitBytes > 0 && usedBytes >= limitBytes * STORAGE_NOTICE_RATIO;
  const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  return (
    <section data-testid="document-folders-card" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t("settings.title")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("settings.appliesAll")}</p>
      {showStorage && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("storageNotice", { used: formatBytes(usedBytes) })}</p>}

      {loadFailed ? (
        <p className="mt-4 text-sm text-red-600">{tp("filesError")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {folders.map((f, i) => {
            const internal = f.defaultKey === "internal";
            return (
              <li key={f.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  {editing?.id === f.id ? (
                    <div className="flex flex-1 gap-2">
                      <input aria-label={t("settings.namePlaceholder")} placeholder={t("settings.namePlaceholder")} value={editing.name} maxLength={FOLDER_NAME_MAX} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
                      <button type="button" disabled={busy} onClick={saveName} className="rounded-lg bg-teal-600 px-3 text-xs font-bold text-white">{tp("saveChanges")}</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 text-xs text-slate-500">{tp("cancel")}</button>
                    </div>
                  ) : (
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{nameOf(f)} <span className="font-normal text-slate-400">· {f.documentCount}</span></p>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={tr("moveUp")} title={tr("moveUp")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={busy || i === folders.length - 1} aria-label={tr("moveDown")} title={tr("moveDown")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">↓</button>
                  </div>
                </div>
                {internal ? (
                  <p className="text-xs text-slate-500">{t("internalNote")}</p>
                ) : (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={f.shared} disabled={busy} onChange={(e) => toggleShared(f, e.target.checked)} className="h-4 w-4 accent-teal-600" />
                      {t("settings.shared")}
                    </label>
                    <label className={`flex items-center gap-2 ${f.shared ? "" : "opacity-50"}`}>
                      <input type="checkbox" checked={f.patientCanUpload} disabled={busy || !f.shared} onChange={(e) => run(() => saveFolder(f.id, { name: f.name, shared: true, patientCanUpload: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
                      {t("settings.canUpload")}
                    </label>
                  </div>
                )}
                {editing?.id !== f.id && (
                  <div className="flex gap-2 text-xs">
                    <button type="button" disabled={busy} onClick={() => setEditing({ id: f.id, name: nameOf(f) })} className="rounded-lg px-2 py-1 font-semibold text-teal-700 hover:bg-teal-50">{t("settings.rename")}</button>
                    {!f.defaultKey && (
                      <button type="button" disabled={busy || f.documentCount > 0} title={f.documentCount > 0 ? t("settings.deleteEmptyOnly") : undefined}
                        onClick={() => run(() => deleteFolder(f.id))} className="rounded-lg px-2 py-1 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">{t("settings.delete")}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p role="alert" className="mt-2 text-sm text-red-600">{msg}</p>}
      {!loadFailed && (
        editing?.id === null ? (
          <div className="mt-3 flex gap-2">
            <input aria-label={t("settings.namePlaceholder")} placeholder={t("settings.namePlaceholder")} value={editing.name} maxLength={FOLDER_NAME_MAX} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
            <button type="button" disabled={busy || !editing.name.trim()} onClick={saveName} className="rounded-xl bg-teal-600 px-4 text-sm font-bold text-white disabled:opacity-60">{tp("saveChanges")}</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-3 text-sm text-slate-500">{tp("cancel")}</button>
          </div>
        ) : folders.length >= FOLDERS_MAX ? (
          <p className="mt-3 text-sm text-slate-500">{t("settings.max")}</p>
        ) : (
          <button type="button" disabled={busy} onClick={() => setEditing({ id: null, name: "" })} className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">+ {t("settings.add")}</button>
        )
      )}
    </section>
  );
}
