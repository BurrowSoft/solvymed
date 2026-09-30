"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatShortDate } from "@/lib/dateLabels";
import { addressDisplay, defaultPick, mergeChoices, mergeDiff, mergeFields, notesFitBoth, type MergeErrorCode, type MergeFieldKey, type MergePick, type MergePreviewSide, type MergeRow } from "@/lib/patientMerge";
import { loadMergeComparison, mergePatientsAction, searchMergeCandidates } from "../actions";

// "Mesclar com outro paciente…" (migration 133; the app's MergePatientsModal):
// pick the other record → only the differing fields, a side for each, and
// which record stays (the one that uses the app by default) → "Mesclar?" →
// when an app account is involved, "São a mesma pessoa". Doctor only; shown
// only once the database has merge_patients.

type Step = "pick" | "compare" | "confirm" | "app" | "saving";
type Candidate = { id: string; full_name: string; birth_date: string | null; archived: boolean };

export function MergePatientButton({ patientId, patientName, locale }: { patientId: string; patientName: string; locale: string }) {
  const t = useTranslations("patientMerge");
  const tp = useTranslations("patientDetail");
  const tAddr = useTranslations("patientAddress");
  // 139's fields use 138's labels (as the app does).
  const fieldLabel = (key: MergeFieldKey) => key === "address" ? tAddr("section") : key === "cns" ? tAddr("cns") : key === "notes_admin" ? tAddr("notes") : t(`field_${key}`);
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [data, setData] = useState<{ rows: MergeRow[]; preview: Record<string, MergePreviewSide>; address?: boolean } | null>(null);
  const [keptId, setKeptId] = useState(patientId);
  const [picks, setPicks] = useState<Partial<Record<MergeFieldKey, MergePick>>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || step !== "pick") return;
    const id = setTimeout(() => { searchMergeCandidates(patientId, q).then(setCandidates).catch(() => setCandidates([])); }, 250);
    return () => clearTimeout(id);
  }, [open, step, q, patientId]);

  const errorText = (c: MergeErrorCode) =>
    c === "both_have_app_accounts" ? t("errBothApp") : c === "kept_patient_archived" ? t("errArchived") : c === "merged_patient_deceased" ? t("errDeceased") : c === "notes_too_long" ? t("notesTooLong") : t("errGeneric");

  function close() {
    setOpen(false); setStep("pick"); setQ(""); setCandidates(null); setData(null); setPicks({}); setError(""); setKeptId(patientId);
  }

  function choose(other: string) {
    setError("");
    start(async () => {
      const d = await loadMergeComparison(patientId, other).catch(() => null);
      if (!d) { setError(t("errGeneric")); return; }
      setData(d);
      // The record that stays: the one that uses the app, else this one.
      const withApp = d.rows.find((r) => d.preview[r.id]?.hasAppAccount);
      setKeptId(withApp ? withApp.id : patientId);
      setPicks({});
      setStep("compare");
    });
  }

  const kept = data?.rows.find((r) => r.id === keptId) ?? null;
  const merged = data?.rows.find((r) => r.id !== keptId) ?? null;
  // 139's address / CNS / Observações once 138 + 139 are applied.
  const fields = mergeFields(!!data?.address);
  const diff = kept && merged ? mergeDiff(kept, merged, fields) : null;
  const notesFit = !!kept && !!merged && notesFitBoth(kept, merged);
  const usesApp = !!data && data.rows.some((r) => data.preview[r.id]?.hasAppAccount);

  const show = (key: MergeFieldKey, p: MergeRow): string => {
    if (key === "address") return addressDisplay(p) || "—";
    const v = fields.find((f) => f.key === key)!.get(p);
    if (!v) return "—";
    if (key === "sex") return v === "male" ? tp("male") : v === "female" ? tp("female") : v === "other" ? tp("other") : v;
    if (key === "convenio_type") return v === "health_plan" ? tp("healthPlan") : v === "particular" ? tp("privateInsurance") : v;
    if (key === "birth_date") return formatShortDate(locale, v);
    if (key === "photo") return t("photoYes");
    return v;
  };
  const pickOf = (key: MergeFieldKey): MergePick => {
    if (!kept || !merged) return "kept";
    return picks[key] ?? defaultPick(key, kept, merged, fields);
  };

  function submit(appConfirmed: boolean) {
    if (!kept || !merged) return;
    setError("");
    setStep("saving");
    start(async () => {
      const r = await mergePatientsAction(kept.id, merged.id, mergeChoices(kept, merged, picks, fields), appConfirmed).catch(() => ({ ok: false as const, code: "generic" as const }));
      if (r.ok) {
        close();
        router.push(`${prefix}/dashboard/patients/${r.keptId}?merged=1`);
        router.refresh();
        return;
      }
      if (r.code === "app_account_confirmation_required") { setStep("app"); return; }
      setError(errorText(r.code));
      setStep("compare");
    });
  }

  const moves = data && kept && merged ? t("moves", {
    a1: data.preview[kept.id]?.appointments ?? 0, b1: data.preview[merged.id]?.appointments ?? 0,
    a2: data.preview[kept.id]?.records ?? 0, b2: data.preview[merged.id]?.records ?? 0,
    a3: data.preview[kept.id]?.prescriptions ?? 0, b3: data.preview[merged.id]?.prescriptions ?? 0,
    a4: data.preview[kept.id]?.files ?? 0, b4: data.preview[merged.id]?.files ?? 0,
  }) : "";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
        {t("action")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label={t("title")} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">{t("title")}</h2>

            {step === "pick" && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">{t("pickOther", { name: patientName })}</p>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} autoFocus
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                {candidates && candidates.length === 0 && <p className="text-sm text-slate-500">{t("noResults")}</p>}
                <ul className="divide-y divide-slate-100">
                  {(candidates ?? []).map((c) => (
                    <li key={c.id}>
                      <button type="button" disabled={pending} onClick={() => choose(c.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-slate-50 disabled:opacity-60">
                        <span className="font-semibold text-slate-800">{c.full_name}</span>
                        <span className="text-xs text-slate-500">
                          {c.birth_date ? formatShortDate(locale, c.birth_date) : ""}{c.archived ? ` · ${t("archivedTag")}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(step === "compare" || step === "confirm" || step === "app" || step === "saving") && kept && merged && diff && data && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[kept, merged].map((r) => (
                    <label key={r.id} className={`rounded-xl border p-3 text-sm ${r.id === kept.id ? "border-teal-400 bg-teal-50" : "border-slate-200"}`}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="keep" checked={r.id === kept.id} disabled={step !== "compare"} onChange={() => { setKeptId(r.id); setPicks({}); }} />
                        <span className="font-semibold text-slate-900">{t("keepThis")}</span>
                      </span>
                      <span className="mt-1 block text-slate-700">{r.full_name}</span>
                      {data.preview[r.id]?.hasAppAccount && <span className="mt-1 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">{t("usesApp")}</span>}
                    </label>
                  ))}
                </div>
                {diff.differing.length === 0 ? <p className="text-sm text-slate-600">{t("noDiff")}</p> : (
                  <table className="w-full text-sm">
                    <tbody>
                      {diff.differing.map((key) => (
                        <tr key={key} className="border-t border-slate-100 align-top">
                          <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabel(key)}</th>
                          {(["kept", "merged"] as const).map((side) => (
                            <td key={side} className="py-2 pr-3">
                              <label className="flex items-center gap-2">
                                <input type="radio" name={`f-${key}`} checked={pickOf(key) === side} disabled={step !== "compare"}
                                  onChange={() => setPicks((p) => ({ ...p, [key]: side }))} />
                                <span className={`text-slate-800 ${key === "notes_admin" ? "whitespace-pre-line" : ""}`}>{show(key, side === "kept" ? kept : merged)}</span>
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {diff.differing.includes("notes_admin") && !!kept.notes_admin && !!merged.notes_admin && (
                  <div className="text-sm">
                    {/* Too long to join: UX's text in place of "both" (the kept notes are pre-selected). */}
                    {notesFit ? (
                      <label className="flex items-center gap-2">
                        <input type="radio" name="f-notes_admin" checked={pickOf("notes_admin") === "both"} disabled={step !== "compare"}
                          onChange={() => setPicks((p) => ({ ...p, notes_admin: "both" }))} />
                        <span className="text-slate-800">{t("pickBoth")}</span>
                      </label>
                    ) : <p className="text-xs text-amber-700">{t("notesTooLong")}</p>}
                  </div>
                )}
                {diff.same > 0 && <p className="text-xs text-slate-500">{t("sameFields", { n: diff.same })}</p>}
                <p className="text-xs text-slate-500">{moves}</p>
                {(kept.booking_blocked || merged.booking_blocked) && <p className="text-xs text-amber-700">{t("bookingBlocked")}</p>}

                {step === "confirm" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-bold text-slate-900">{t("confirmTitle")}</p>
                    <p className="mt-1 text-slate-700">{t("confirmBody", { merged: merged.full_name, kept: kept.full_name })}</p>
                  </div>
                )}
                {step === "app" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <p className="text-slate-800">{t("appBody", { name: (data.preview[kept.id]?.hasAppAccount ? kept : merged).full_name })}</p>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={step === "compare" ? () => { setStep("pick"); setData(null); } : () => setStep("compare")} disabled={step === "saving"} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    {step === "compare" ? t("back") : t("cancel")}
                  </button>
                  {step === "compare" && <button type="button" onClick={() => setStep("confirm")} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">{t("merge")}</button>}
                  {step === "confirm" && <button type="button" onClick={() => (usesApp ? setStep("app") : submit(false))} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">{t("merge")}</button>}
                  {(step === "app" || step === "saving") && <button type="button" onClick={() => submit(true)} disabled={step === "saving"} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{step === "saving" ? "…" : t("samePerson")}</button>}
                </div>
              </div>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
            {step === "pick" && (
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{t("cancel")}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
