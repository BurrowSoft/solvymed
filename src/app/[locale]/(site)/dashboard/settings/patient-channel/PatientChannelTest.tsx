"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { findTerms, scoreRequest, type AnswerKey, type Answers, type ChannelConfig, type ScoreLine } from "@/lib/patientChannel/score";
import { BandTag } from "./BandTag";
import { PcPageFrame } from "@/components/patientChannel/PcPageFrame";
import type { PageLook } from "@/lib/patientChannel/pageLook";

export type PatientView = { doctorName: string; practiceLine: string; look: PageLook };

// "Test as a patient" (§6; the prototype's test mode): the patient's form on the rules
// being edited, the doctor's live score beside it, and on Send a result screen. No
// request, no counter, no notification: it never leaves the browser. The doctor may see
// the weights here (§10.9). The smart text box (chips, suggestions) arrives with M4.

const TEXT_MAX = 500;
const START: Answers = { symptomIds: [], chips: [], when: 0, intensity: 1, stillTaking: 0, text: "" };
const QUESTIONS: { key: AnswerKey; n: number }[] = [
  { key: "when", n: 3 },
  { key: "intensity", n: 3 },
  { key: "stillTaking", n: 2 },
];

export function PatientChannelTest({ rules, emergencyNumber, onBack, patientView }: { rules: ChannelConfig; emergencyNumber: string; onBack: () => void; patientView?: PatientView }) {
  const t = useTranslations("patientChannel");
  const [answers, setAnswers] = useState<Answers>(START);
  const [result, setResult] = useState<"sent" | "skipped" | null>(null);
  const score = useMemo(() => scoreRequest(rules, answers), [rules, answers]);
  const recognised = useMemo(() => [...new Set(findTerms(rules, answers.text).map((m) => m.term))], [rules, answers.text]);
  const fired = rules.autoMessages.filter((a) => score.autoMessages.includes(a.id));

  const bar = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-bold">{t("test.bar")}</span>
      <button type="button" onClick={onBack} className="rounded-full border border-amber-400 bg-white px-3 py-1 text-xs font-semibold">{t("test.back")}</button>
    </div>
  );

  if (result) {
    return (
      <div data-testid="pc-test-result" className="flex max-w-xl flex-col gap-4">
        {bar}
        {result === "skipped" ? (
          <p className="rounded-xl border border-green-600 bg-green-50 p-4 text-sm text-green-900">{t("test.skipped")}</p>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-base font-bold text-slate-900">{t("test.resultTitle")}</h2>
            <ScorePanel rules={rules} score={score} />
            <p className="mt-3 text-sm text-slate-600">{t("test.resultWarning", { answer: score.warning ? t("test.yes") : t("test.no") })}</p>
            <p className="text-sm text-slate-600">{t("test.resultAuto", { n: fired.length })}</p>
          </div>
        )}
        <button type="button" onClick={() => setResult(null)} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">{t("test.again")}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {bar}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <form
          className="min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
          onSubmit={(e) => { e.preventDefault(); setResult("sent"); }}
        >
          {/* As patients see the page: the saved band / cover, logo and watermark (01). */}
          <PcPageFrame look={patientView?.look} doctorName={patientView?.doctorName ?? ""} practiceLine={patientView?.practiceLine ?? ""} testId="pc-test-page">
          <fieldset className="min-w-0">
            <legend className="text-sm text-slate-700">{t("test.pick")}</legend>
            <div className="mt-2 flex flex-col gap-1.5">
              {rules.symptoms.length === 0 && <p className="text-xs text-slate-500">{t("adjust.none")}</p>}
              {rules.symptoms.map((s) => (
                <label key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={answers.symptomIds.includes(s.id)}
                    onChange={(e) => setAnswers({ ...answers, symptomIds: e.target.checked ? [...answers.symptomIds, s.id] : answers.symptomIds.filter((x) => x !== s.id) })}
                  />
                  <span className="min-w-0 break-words">{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {score.warning && (
            <p role="alert" data-testid="pc-test-emergency" className="mt-3 rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">
              {t("test.emergency", { number: emergencyNumber })}
            </p>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {QUESTIONS.map(({ key, n }) => (
              <label key={key} className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">
                {t(`answers.${key}Q`)}
                <select
                  className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={answers[key]}
                  onChange={(e) => setAnswers({ ...answers, [key]: Number(e.target.value) })}
                >
                  {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{t(`answers.${key}${i}`)}</option>)}
                </select>
              </label>
            ))}
          </div>

          <label htmlFor="pc-test-text" className="mt-3 block text-sm text-slate-700">{t("test.textLabel")}</label>
          <textarea
            id="pc-test-text"
            className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            maxLength={TEXT_MAX}
            placeholder={t("test.textPlaceholder")}
            value={answers.text}
            onChange={(e) => setAnswers({ ...answers, text: e.target.value })}
          />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <span className="min-w-0 break-words">{recognised.length > 0 ? t("test.recognised", { terms: recognised.join(", ") }) : ""}</span>
            <span className="tabular-nums">{answers.text.length} / {TEXT_MAX}</span>
          </div>

          {fired.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {fired.map((a) => (
                <div key={a.id} data-testid="pc-test-auto" className={`rounded-xl border p-3 text-sm ${a.tone === "attention" ? "border-amber-400 bg-amber-50" : "border-teal-300 bg-teal-50"}`}>
                  <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">{t("test.autoWho")}</span>
                  <span className="break-words">{a.text}</span>
                </div>
              ))}
              {score.canSkipSend && (
                <button type="button" data-testid="pc-test-skip" onClick={() => setResult("skipped")} className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700">
                  {t("test.skip")}
                </button>
              )}
              <p className="text-xs text-slate-500">{t("test.general")}</p>
            </div>
          )}

          <button type="submit" className="mt-4 w-full rounded-xl bg-[var(--pc-brand)] px-4 py-2.5 text-sm font-bold text-[var(--pc-ink)]">{t("test.send")}</button>
          </PcPageFrame>
        </form>

        <aside className="min-w-0 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-4" aria-label={t("test.live")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">{t("test.live")}</h2>
            <span className="text-xs text-slate-500">{t("test.liveSub")}</span>
          </div>
          <ScorePanel rules={rules} score={score} />
          <p className="mt-2 text-xs text-slate-500">{t("test.scale", { attention: rules.thresholds.attention, urgent: rules.thresholds.urgent })}</p>
          {score.warning && <p className="mt-2 border-l-4 border-red-600 pl-3 text-xs text-slate-700">{t("test.warningOn")}</p>}
        </aside>
      </div>
    </div>
  );
}

function ScorePanel({ rules, score }: { rules: ChannelConfig; score: ReturnType<typeof scoreRequest> }) {
  const t = useTranslations("patientChannel");
  return (
    <div className="mt-3" data-testid="pc-test-score">
      <div className="flex items-center gap-3">
        <span className="text-4xl font-extrabold tabular-nums text-slate-900" data-testid="pc-test-total">{score.total}</span>
        <BandTag band={score.band} />
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm tabular-nums">
        {score.lines.length === 0 && <li className="text-xs text-slate-500">{t("test.noSymptom")}</li>}
        {score.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 border-b border-dotted border-slate-200 pb-1">
            <span className="min-w-0 break-words">{lineLabel(rules, l, t)}</span>
            <b className={l.points > 0 ? "text-red-700" : "text-green-700"}>{l.points > 0 ? `+${l.points}` : l.points}</b>
          </li>
        ))}
      </ul>
      {score.floorApplied && <p className="mt-2 text-xs text-slate-600">{t("test.floor", { band: t(`bands.${rules.minBandForTextOnly}`) })}</p>}
    </div>
  );
}

// A breakdown line in the viewer's language from its structured label (§7).
export function lineLabel(rules: ChannelConfig, line: ScoreLine, t: (key: string, values?: Record<string, string | number>) => string): string {
  const symptom = (id: string) => rules.symptoms.find((s) => s.id === id)?.name ?? "?";
  let base: string;
  if ("comboId" in line.label) {
    const c = rules.combinations.find((x) => x.id === (line.label as { comboId: string }).comboId);
    base = t("lines.combo", { names: (c?.symptomIds ?? []).map(symptom).join(" + ") });
  } else {
    base = symptom(line.label.symptomId);
    if (line.source === "text") base = `${base} ${t("lines.text")}`;
  }
  if (line.source === "ai") base = `${t("lines.ai")} · ${base}`;
  const { answerKey, answerIndex } = line.label;
  return answerKey !== undefined && answerIndex !== undefined ? `${base} · ${t(`answers.${answerKey}${answerIndex}`)}` : base;
}
