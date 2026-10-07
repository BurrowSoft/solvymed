"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dateLocale } from "@/lib/dateLabels";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { readInWorker } from "@/lib/import/readInWorker";
import type { ReadResult, SheetCell } from "@/lib/import/readFile";
import { buildRows, detectSource, importFields, planColumns, presetFor, separateNames, type ColumnPlan, type ImportCap, type ImportField, type ImportSource } from "@/lib/import/plan";
import { patientIdKind } from "@/lib/patientIds";
import {
  ImportError, commitImport, discardImport, lastUndoableImport, previewRows, problemRows, stageImport, undoImport, validateImport,
  type CommitSummary, type ImportDb, type LastImport, type PreviewRow, type ValidateSummary,
} from "@/lib/import/api";
import { templateCsv } from "@/lib/import/template";
import { countryProfile } from "@/lib/country";
import { errorListCsv, lostLeadingZero } from "@/lib/import/errorList";

// Importar pacientes (UX, migrations 130/131): the file is read in the
// browser, the columns are mapped (a preset for iClinic / Prontuário Verde,
// suggestions for any sheet), the rows are checked by the database and
// previewed, and nothing becomes a patient until "Importar". Doctor only.

type Step = "file" | "map" | "preview" | "done";
type Sheet = { name: string; headers: string[]; rows: SheetCell[][] };

// 139's address parts and CNS use 138's labels (patientAddress), by country.
const FIELD_KEY: Partial<Record<ImportField, string>> = {
  full_name: "fieldFullName", cpf: "fieldCpf", th_national_id: "fieldThId", passport_number: "fieldPassport",
  birth_date: "fieldBirthDate", sex: "fieldSex", phone: "fieldPhone", email: "fieldEmail", rg: "fieldRg",
  profession: "fieldProfession", tags: "fieldTags",
};
const SOURCES: ImportSource[] = ["generic", "iclinic", "prontuario_verde"];
const ROW_CODES = [
  "full_name_missing", "full_name_too_long", "unknown_field", "row_invalid",
  "cpf_invalid", "cpf_zero_padded", "cpf_not_used", "th_national_id_invalid", "th_national_id_not_used", "passport_invalid", "passport_not_used",
  "birth_date_invalid", "birth_date_be_converted", "sex_unknown", "phone_invalid", "phone_unverified", "phone_matches_existing",
  "email_invalid", "rg_invalid", "profession_invalid", "tags_trimmed", "extra_trimmed", "archived_unknown",
  // 139: the address and the CNS.
  "cep_zero_padded", "cns_invalid", "cns_not_used",
];
const ADDRESS_PART: Record<string, string> = {
  address_postal_code: "postal", address_street: "street", address_number: "number", address_complement: "complement",
  address_neighborhood: "neighborhood", address_city: "city", address_state: "state",
};

const btn = "rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60";
const btn2 = "rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-60";

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// addressLive: 138 + 139 applied, so the v3 presets (address + CNS) are usable.
// timeZone: the clinic's, for the "Última importação" card's times.
export function ImportClient({ locale, country, canMerge = false, addressLive = false, timeZone, db: injected }: { locale: string; country: string; canMerge?: boolean; addressLive?: boolean; timeZone?: string; db?: ImportDb }) {
  const t = useTranslations("patientImport");
  const tAddr = useTranslations("patientAddress");
  const caps: ImportCap[] = useMemo(() => (addressLive ? ["import-address"] : []), [addressLive]);
  const kind = patientIdKind(country);
  const fieldLabel = (f: ImportField) => FIELD_KEY[f] ? t(FIELD_KEY[f]!) : f === "cns" ? tAddr("cns") : tAddr(`${kind}_${ADDRESS_PART[f]}`);
  const prefix = locale === "en" ? "" : `/${locale}`;
  const db = useMemo(() => injected ?? (createClient() as unknown as ImportDb), [injected]);
  const [step, setStep] = useState<Step>("file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [source, setSource] = useState<ImportSource>("generic");
  const [plan, setPlan] = useState<ColumnPlan[]>([]);
  const [onExisting, setOnExisting] = useState<"skip" | "fill_empty">("skip");
  const [importId, setImportId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ValidateSummary | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<CommitSummary | null>(null);
  const [undone, setUndone] = useState<{ deleted: number; kept: number } | null>(null);
  // "Última importação" (UX): the last import of the past 24 h, so its
  // Desfazer stays reachable after leaving this page. Loaded after mount.
  const [last, setLast] = useState<LastImport | null>(null);
  const [lastUndone, setLastUndone] = useState<{ deleted: number; kept: number } | null>(null);
  useEffect(() => {
    let alive = true;
    lastUndoableImport(db).then((l) => { if (alive) setLast(l); });
    return () => { alive = false; };
  }, [db]);
  const when = (iso: string) => ({
    date: new Intl.DateTimeFormat(dateLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).format(new Date(iso)),
    time: new Intl.DateTimeFormat(dateLocale(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso)),
  });
  const systemName = (source: string) => (source === "generic" || !SOURCES.includes(source as ImportSource) ? t("sourceGeneric") : presetFor(source as ImportSource).label);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // An invalid CPF of 9 or 10 digits most likely lost its leading zero in
  // Excel and still failed the check digits after 130 padded it: say how to
  // export it properly.
  const reason = (code: string, row?: PreviewRow) => {
    // address_<part>_invalid: that part, too long.
    const part = code.match(/^(address_[a-z_]+)_invalid$/)?.[1];
    if (part && ADDRESS_PART[part]) return t("code_address_invalid", { field: fieldLabel(part as ImportField) });
    const text = ROW_CODES.includes(code) ? t(`code_${code}`) : code;
    return code === "cpf_invalid" && lostLeadingZero(row?.input?.cpf) ? `${text}. ${t("cpfExcelHint")}` : text;
  };
  const failText = (e: unknown) => {
    const code = e instanceof ImportError ? e.code : "generic";
    return t(`err_${code}`);
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(t("reading"));
    let r: ReadResult;
    try { r = await readInWorker(file, ["\t", ";", ","]); } catch { r = { ok: false, error: "unreadable" }; }
    setBusy(null);
    if (!r.ok) { setError(t(`file_${r.error}`)); return; }
    const detected = detectSource(r.headers, file.name, [], caps);
    setSheet({ name: file.name, headers: r.headers, rows: r.rows });
    setSource(detected);
    setPlan(planColumns(detected, r.headers, caps));
    setStep("map");
  }

  function changeSource(s: ImportSource) {
    if (!sheet) return;
    setSource(s);
    setPlan(planColumns(s, sheet.headers, caps));
  }

  // The doctor's choice for one column: a field, imported data, or ignore.
  function changeTarget(index: number, value: string) {
    setPlan((p) => p.map((c) => {
      if (c.index !== index) return c;
      if (value === "ignore") return { ...c, kind: "ignore" };
      if (value === "extra") return { ...c, kind: "extra", field: undefined, label: c.label ?? c.header, sensitive: false, keep: true };
      // A field picked by hand: the preset's codes still apply when it's the same field.
      const same = c.kind === "field" && c.field === value;
      return same ? c : { index: c.index, header: c.header, kind: "field", field: value as ImportField, split: value === "tags" ? ";" : undefined };
    }));
  }
  const toggleKeep = (index: number) => setPlan((p) => p.map((c) => (c.index === index ? { ...c, keep: !c.keep } : c)));

  const example = (i: number) => sheet?.rows.find((r) => String(r[i] ?? "").trim() !== "")?.[i] ?? "";
  const hasName = plan.some((c) => c.kind === "field" && c.field === "full_name");

  async function check() {
    if (!sheet) return;
    if (!hasName) { setError(t("nameRequired")); return; }
    setError("");
    try {
      const rows = buildRows(plan, sheet.rows);
      setBusy(t("sending", { sent: 0, total: rows.length }));
      const id = await stageImport(db, source, sheet.name, rows, (sent) => setBusy(t("sending", { sent, total: rows.length })));
      setImportId(id);
      setBusy(t("validating"));
      setSummary(await validateImport(db, id, onExisting));
      setPreview(await previewRows(db, id));
      setStep("preview");
    } catch (e) {
      setError(failText(e));
    } finally {
      setBusy(null);
    }
  }

  // "Pacientes que já existem" changed on the preview: validate again.
  async function revalidate(next: "skip" | "fill_empty") {
    setOnExisting(next);
    if (!importId) return;
    setBusy(t("validating"));
    try { setSummary(await validateImport(db, importId, next)); } catch (e) { setError(failText(e)); } finally { setBusy(null); }
  }

  async function downloadErrors() {
    if (!importId) return;
    try {
      const rows = await problemRows(db, importId);
      download(`${t("errorFileName")}.csv`, errorListCsv(rows, { row: t("colRow"), name: t("colName"), reason: t("colReason") }, reason, (n) => t("repeatedOf", { row: n }), locale === "en" ? "," : ";"));
    } catch (e) { setError(failText(e)); }
  }

  async function confirmImport() {
    if (!importId) return;
    setBusy(t("importing"));
    setError("");
    try { setResult(await commitImport(db, importId)); setStep("done"); } catch (e) { setError(failText(e)); } finally { setBusy(null); }
  }

  async function undo() {
    if (!importId || !confirm(t("undoConfirm"))) return;
    setBusy(t("undoing"));
    try { setUndone(await undoImport(db, importId)); } catch (e) { setError(failText(e)); } finally { setBusy(null); }
  }

  // The card's Desfazer: the same confirmation and rules as on the Done step.
  async function undoLast() {
    if (!last || !confirm(t("undoConfirm"))) return;
    setError("");
    setBusy(t("undoing"));
    try { setLastUndone(await undoImport(db, last.id)); setLast(null); } catch (e) { setError(failText(e)); } finally { setBusy(null); }
  }

  async function cancel() {
    if (importId && step !== "done") await discardImport(db, importId).catch(() => {});
    setImportId(null); setSheet(null); setPlan([]); setSummary(null); setPreview([]); setError(""); setStep("file");
    if (fileInput.current) fileInput.current.value = "";
  }

  const toImport = summary ? summary.new + (onExisting === "fill_empty" ? summary.existing_to_fill : 0) : 0;
  const outcome = (r: PreviewRow) =>
    r.outcome === "new" ? t("outcomeNew") : r.outcome === "existing" ? t("outcomeExisting")
      : r.outcome === "duplicate_in_file" ? t("repeatedOf", { row: r.duplicate_of_row ?? 0 }) : t("outcomeInvalid");

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <Link href={`${prefix}/dashboard/patients`} className="text-sm font-semibold text-teal-700 hover:underline">← {t("backToPatients")}</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("lead")}</p>
      </div>

      {step !== "done" && (
        <p role="note" className="mb-5 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{t("nothingSaved")}</p>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        {step === "file" && (
          <div className="space-y-4">
            {last && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">{t("lastTitle")}</p>
                <p className="mt-1 text-slate-700">{t("lastLine", { ...when(last.committedAt), n: last.created, system: systemName(last.source) })}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className={btn2} disabled={!!busy} onClick={undoLast}>{t("undo")}</button>
                  <span className="text-xs text-slate-500">{t("lastUntil", when(last.until))}</span>
                </div>
              </div>
            )}
            {lastUndone && <p className="text-sm font-semibold text-slate-700">{t("undone", { deleted: lastUndone.deleted, kept: lastUndone.kept })}</p>}
            <h2 className="text-base font-bold text-slate-900">{t("stepFile")}</h2>
            <p className="text-sm text-slate-600">{t("fileHint")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className={`${btn} cursor-pointer`}>
                {t("chooseFile")}
                <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button type="button" className={btn2} onClick={() => { const { fileName, csv } = templateCsv(locale, country, addressLive); download(fileName, csv); }}>
                {t("template")}
              </button>
            </div>
            <p className="text-xs text-slate-500">{t("fileFormats")}</p>
            {/* The presets named per country (registry importPresets), by their own labels. */}
            {countryProfile(country).importPresets.length > 0 && (
              <p className="text-xs text-slate-500">
                {t("fileFormatsPresets", { systems: new Intl.ListFormat(locale, { type: "conjunction" }).format(countryProfile(country).importPresets.map((s) => presetFor(s).label)) })}
              </p>
            )}
            {/* _import_birth_date (130) converts years >= 2400 from the Buddhist era. */}
            {countryProfile(country).calendar === "buddhist" && <p className="text-xs text-slate-500">{t("beYears")}</p>}
          </div>
        )}

        {step === "map" && sheet && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{t("stepMap")}</h2>
                <p className="text-sm text-slate-500">{t("fileSummary", { file: sheet.name, n: sheet.rows.length })}</p>
              </div>
              <label className="text-sm text-slate-600">
                <span className="mr-2 font-semibold">{t("source")}</span>
                <select value={source} onChange={(e) => changeSource(e.target.value as ImportSource)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {SOURCES.map((s) => <option key={s} value={s}>{s === "generic" ? t("sourceGeneric") : presetFor(s, caps).label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500">{t("extrasHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">{t("colColumn")}</th><th className="py-2 pr-3">{t("colExample")}</th><th className="py-2">{t("colTarget")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((c) => (
                    <tr key={c.index} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3 font-semibold text-slate-800">{c.header || `#${c.index + 1}`}</td>
                      <td className="py-2 pr-3 text-slate-500 break-all">{String(example(c.index)).slice(0, 60)}</td>
                      <td className="py-2">
                        {c.namePart === "first" ? (
                          <span className="text-slate-700">
                            {t("nameJoined", { first: c.header, last: plan.find((x) => x.namePart === "last")?.header ?? "" })}
                            <button type="button" onClick={() => setPlan((p) => separateNames(p))} className="ml-2 text-xs font-semibold text-teal-700 underline">{t("nameSeparate")}</button>
                          </span>
                        ) : c.namePart === "last" ? (
                          <span className="text-slate-500">{t("namePartOf")}</span>
                        ) : c.field === "archived" ? (
                          <span className="text-slate-700">{t("targetArchived")}</span>
                        ) : (
                          <select aria-label={c.header} value={c.kind === "field" ? c.field : c.kind} onChange={(e) => changeTarget(c.index, e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                            {importFields(caps).map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
                            <option value="extra">{t("targetExtra")}</option>
                            <option value="ignore">{t("targetIgnore")}</option>
                          </select>
                        )}
                        {c.kind === "extra" && c.sensitive && (
                          <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <input type="checkbox" checked={!!c.keep} onChange={() => toggleKeep(c.index)} />
                            {c.keep ? t("sensitiveKept") : t("sensitiveNote")}
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">{t("existingTitle")}</legend>
              <div className="mt-1 flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="radio" name="existing" checked={onExisting === "skip"} onChange={() => setOnExisting("skip")} />{t("existingSkip")}</label>
                <label className="flex items-center gap-2"><input type="radio" name="existing" checked={onExisting === "fill_empty"} onChange={() => setOnExisting("fill_empty")} />{t("existingFill")}</label>
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btn} disabled={!!busy} onClick={check}>{t("check")}</button>
              <button type="button" className={btn2} disabled={!!busy} onClick={cancel}>{t("cancel")}</button>
            </div>
          </div>
        )}

        {step === "preview" && summary && (
          <div className="space-y-5">
            <h2 className="text-base font-bold text-slate-900">{t("stepPreview")}</h2>
            <p className="text-lg font-bold text-slate-900">{t("summary", { new: summary.new, existing: summary.existing, invalid: summary.invalid })}</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {summary.duplicate_in_file > 0 && <li>{t("summaryDuplicates", { n: summary.duplicate_in_file })}</li>}
              {summary.with_warnings > 0 && <li>{t("summaryWarnings", { n: summary.with_warnings })}</li>}
              {(summary.archived ?? 0) > 0 && <li>{t("summaryArchived", { n: summary.archived ?? 0 })}</li>}
              {(summary.cpf_zero_padded ?? 0) > 0 && <li>{t("summaryCpfPadded", { n: summary.cpf_zero_padded ?? 0 })}</li>}
              {(summary.cep_zero_padded ?? 0) > 0 && <li>{t("summaryCepPadded", { n: summary.cep_zero_padded ?? 0 })}</li>}
            </ul>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">{t("existingTitle")}</legend>
              <div className="mt-1 flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="radio" name="existing2" checked={onExisting === "skip"} disabled={!!busy} onChange={() => revalidate("skip")} />{t("existingSkip")}</label>
                <label className="flex items-center gap-2"><input type="radio" name="existing2" checked={onExisting === "fill_empty"} disabled={!!busy} onChange={() => revalidate("fill_empty")} />{t("existingFill")}</label>
              </div>
              {onExisting === "fill_empty" && summary.existing_to_fill > 0 && <p className="mt-1 text-xs text-slate-500">{t("summaryFill", { n: summary.existing_to_fill })}</p>}
            </fieldset>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">{t("colRow")}</th><th className="py-2 pr-3">{t("colName")}</th><th className="py-2">{t("colResult")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row_no} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3 text-slate-500">{r.row_no}</td>
                      <td className="py-2 pr-3 text-slate-800">{String(r.input?.full_name ?? "")}</td>
                      <td className="py-2">
                        <span className={r.outcome === "invalid" ? "font-semibold text-red-600" : "text-slate-700"}>{outcome(r)}</span>
                        {[...r.errors, ...r.warnings].length > 0 && (
                          <span className="block text-xs text-slate-500">{[...r.errors, ...r.warnings].map((c) => reason(c, r)).join(" · ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.total > preview.length && <p className="mt-2 text-xs text-slate-400">{t("previewMore", { shown: preview.length, total: summary.total })}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btn} disabled={!!busy || toImport === 0} onClick={confirmImport}>{t("confirm", { n: toImport })}</button>
              {(summary.invalid > 0 || summary.with_warnings > 0 || summary.duplicate_in_file > 0) && (
                <button type="button" className={btn2} disabled={!!busy} onClick={downloadErrors}>{t("errorList")}</button>
              )}
              <button type="button" className={btn2} disabled={!!busy} onClick={() => setStep("map")}>{t("back")}</button>
              <button type="button" className={btn2} disabled={!!busy} onClick={cancel}>{t("cancel")}</button>
            </div>
            {toImport === 0 && <p className="text-sm text-slate-500">{t("noneToImport")}</p>}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">{t("doneTitle")}</h2>
            <ul className="space-y-1 text-sm text-slate-700">
              <li className="font-semibold">{t("doneCreated", { n: result.created })}</li>
              {result.filled > 0 && <li>{t("doneFilled", { n: result.filled })}</li>}
              {result.existing_skipped > 0 && <li>{t("doneSkipped", { n: result.existing_skipped })}</li>}
              {(result.archived ?? 0) > 0 && <li>{t("doneArchived", { n: result.archived ?? 0 })}</li>}
              {result.invalid + result.duplicate_in_file > 0 && <li>{t("doneNotImported", { n: result.invalid + result.duplicate_in_file })}</li>}
              {result.conflicts > 0 && <li>{t("doneConflicts", { n: result.conflicts })}</li>}
            </ul>
            {/* Rows that already existed: how to join a duplicate afterwards (UX). */}
            {canMerge && result.existing_skipped + result.filled > 0 && <p className="text-sm text-slate-600">{t("doneMergeHint")}</p>}
            {undone ? (
              <p className="text-sm font-semibold text-slate-700">{t("undone", { deleted: undone.deleted, kept: undone.kept })}</p>
            ) : (
              <p className="text-xs text-slate-500">{t("undoHint")}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href={`${prefix}/dashboard/patients`} className={btn}>{t("seePatients")}</Link>
              {!undone && result.created > 0 && <button type="button" className={btn2} disabled={!!busy} onClick={undo}>{t("undo")}</button>}
            </div>
          </div>
        )}

        {busy && <p role="status" className="mt-4 text-sm text-slate-500">{busy}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
