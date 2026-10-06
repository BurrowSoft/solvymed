"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RECORD_PRESETS, presetToTemplate } from "@/lib/recordPresets";
import { SECTION_HINT_MAX, SECTION_TITLE_MAX, TEMPLATE_NAME_MAX, TEMPLATE_SECTIONS_MAX, TEMPLATES_PER_DOCTOR, type RecordTemplate } from "@/lib/recordTemplates";
import { deleteRecordTemplate, saveRecordTemplate, type TemplateError } from "./record-template-actions";

// Settings → Record templates (1.8.0 D; server flag 'record_templates').
// A new template starts blank or as a copy of a specialty preset, in the UI
// language; the presets themselves never change. Records already written
// keep their own sections, so editing or deleting a template is safe.

type Row = { key: number; title: string; hint: string };
let rowKey = 0;
const row = (title = "", hint = ""): Row => ({ key: ++rowKey, title, hint });
type Draft = { id: string | null; name: string; rows: Row[] };

const inputClass = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

export function RecordTemplatesCard({ initial, loadFailed }: { initial: RecordTemplate[]; loadFailed: boolean }) {
  const t = useTranslations("recordTemplates");
  const locale = useLocale();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();

  const errorText = (c: TemplateError) =>
    t(c === "name" ? "errName" : c === "sections" ? "errSections" : c === "title" ? "errTitle" : c === "hint" ? "errHint" : c === "limit" ? "errLimit" : "errFailed");
  const atLimit = rows.length >= TEMPLATES_PER_DOCTOR;

  function openNew() { setMsg(null); setDraft({ id: null, name: "", rows: [row()] }); }
  function openPreset(id: string) {
    const p = RECORD_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const tpl = presetToTemplate(p, locale);
    setMsg(null);
    setDraft({ id: null, name: tpl.name, rows: tpl.sections.map((s) => row(s.title, s.hint ?? "")) });
  }
  function openEdit(r: RecordTemplate) { setMsg(null); setDraft({ id: r.id, name: r.name, rows: r.sections.map((s) => row(s.title, s.hint ?? "")) }); }

  function setRow(key: number, patch: Partial<Row>) {
    setDraft((d) => d && { ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  }
  function move(i: number, by: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + by;
      if (j < 0 || j >= d.rows.length) return d;
      const next = d.rows.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, rows: next };
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      const r = await saveRecordTemplate(d.id, { name: d.name, sections: d.rows.map((x) => ({ title: x.title, hint: x.hint })) });
      if (!r.ok) { setMsg({ kind: "error", text: errorText(r.code) }); return; }
      setRows((prev) => (d.id ? prev.map((x) => (x.id === r.row.id ? r.row : x)) : [...prev, r.row]));
      setDraft(null);
      setMsg({ kind: "ok", text: t("saved") });
    });
  }

  function remove(r: RecordTemplate) {
    if (!window.confirm(t("deleteConfirm", { name: r.name }))) return;
    setMsg(null);
    start(async () => {
      const res = await deleteRecordTemplate(r.id);
      if (res.ok) setRows((prev) => prev.filter((x) => x.id !== r.id));
      else setMsg({ kind: "error", text: t("errFailed") });
    });
  }

  return (
    <section data-testid="record-templates-card" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("description")}</p>

      {loadFailed ? (
        <p className="mt-4 text-sm text-red-600">{t("errLoad")}</p>
      ) : draft ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("templateName")}</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={TEMPLATE_NAME_MAX} required className={inputClass} />
          </label>
          <ol className="space-y-3">
            {draft.rows.map((r, i) => (
              <li key={r.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-xs font-semibold text-slate-400">{i + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input aria-label={t("sectionTitle")} placeholder={t("sectionTitle")} value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} maxLength={SECTION_TITLE_MAX} className={inputClass} />
                    <input aria-label={t("sectionHint")} placeholder={t("sectionHint")} value={r.hint} onChange={(e) => setRow(r.key, { hint: e.target.value })} maxLength={SECTION_HINT_MAX} className={inputClass} />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")} title={t("moveUp")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === draft.rows.length - 1} aria-label={t("moveDown")} title={t("moveDown")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => setDraft({ ...draft, rows: draft.rows.filter((x) => x.key !== r.key) })} disabled={draft.rows.length === 1} aria-label={t("removeSection")} title={t("removeSection")} className="rounded-lg px-2 py-1 text-red-500 hover:bg-red-50 disabled:opacity-30">✕</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setDraft({ ...draft, rows: [...draft.rows, row()] })} disabled={draft.rows.length >= TEMPLATE_SECTIONS_MAX} className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            + {t("addSection")}
          </button>
          {msg && <p role="status" className={`text-sm ${msg.kind === "ok" ? "text-teal-700" : "text-red-600"}`}>{msg.text}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setDraft(null); setMsg(null); }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t("cancel")}</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{t("save")}</button>
          </div>
        </form>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("empty")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{t("sectionCount", { n: r.sections.length })}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => openEdit(r)} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50">{t("edit")}</button>
                    <button type="button" onClick={() => remove(r)} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">{t("delete")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {msg && <p role="status" className={`mt-2 text-sm ${msg.kind === "ok" ? "text-teal-700" : "text-red-600"}`}>{msg.text}</p>}
          {atLimit ? (
            <p className="mt-4 text-sm text-slate-500">{t("errLimit")}</p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={openNew} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">{t("newTemplate")}</button>
              <select
                aria-label={t("fromPreset")}
                value=""
                onChange={(e) => openPreset(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 focus:border-teal-500 focus:outline-none"
              >
                <option value="" disabled>{t("fromPreset")}</option>
                {RECORD_PRESETS.map((p) => <option key={p.id} value={p.id}>{presetToTemplate(p, locale).name}</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </section>
  );
}
