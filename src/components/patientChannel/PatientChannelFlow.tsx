"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { immediateWarning, type AnswerKey, type Answers } from "@/lib/patientChannel/score";
import { PC_TEXT_MAX, type PcPatientPage, type PcPreview, type PcPreviewFn, type PcReason, type PcSubmitFn } from "@/lib/patientChannel/patientPage";
import { SmartTextBox } from "./SmartTextBox";

// The patient's Patient Channel (specs/patient-contact-tech.md §6; the prototype v17's
// tab 1), phone first: entry (the rules, the response time, the practice country's
// emergency number) → FAQ → reason (→ who it goes to) → the form → sent (one open request
// at a time; "replace?" when one is open). The patient never sees a score or a band.
// The emergency warning shows at once from the vocabulary (immediate-warning symptoms,
// offline too) and from /preview (red); the automatic messages and "I don't need to send"
// come only from /preview, and the skip is never offered with a warning or when red.

type Step = "entry" | "faq" | "reason" | "form" | "sent" | "replace" | "resolved";
const QUESTIONS: { key: AnswerKey; n: number }[] = [
  { key: "when", n: 3 },
  { key: "intensity", n: 3 },
  { key: "stillTaking", n: 2 },
];
const START: Answers = { symptomIds: [], chips: [], when: 0, intensity: 0, stillTaking: 0, text: "" };
const PREVIEW_MS = 300;

export function PatientChannelFlow({ page, preview, submit, banner }: {
  page: PcPatientPage;
  preview: PcPreviewFn;
  submit: PcSubmitFn;
  // The preview test's "sample data, nothing is sent" bar.
  banner?: string;
}) {
  const t = useTranslations("patientChannel.patient");
  const ta = useTranslations("patientChannel.answers");
  const [step, setStep] = useState<Step>("entry");
  const [reason, setReason] = useState<PcReason | null>(null);
  const [answers, setAnswers] = useState<Answers>(START);
  const [option, setOption] = useState(0);
  const [check, setCheck] = useState<PcPreview>({ warning: false, autoMessages: [], canSkip: false });
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const number = page.emergencyNumber ?? t("localNumber");
  const symptomForm = reason?.kind === "symptom_form";
  const who = reason?.destination === "secretary" ? t("secretary") : page.doctorName;

  // /preview, debounced (§10.6); the latest answer wins.
  const seq = useRef(0);
  useEffect(() => {
    if (step !== "form" || !reason || !symptomForm) return;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      void preview(reason.id, answers).then((r) => { if (n === seq.current) setCheck(r); }).catch(() => undefined);
    }, PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [answers, reason, step, symptomForm, preview]);

  const warning = symptomForm && (immediateWarning(page.vocabulary, answers) || check.warning);
  const canSkip = symptomForm && check.canSkip && !warning && check.autoMessages.length > 0;

  const send = async (replace: boolean) => {
    if (!reason || sending) return;
    setSending(true);
    setFailed(false);
    const r = await submit(reason.id, symptomForm ? answers : { option: reason.options[option] ?? "" }, replace).catch(() => ({ status: "error" as const }));
    setSending(false);
    if (r.status === "sent") setStep("sent");
    else if (r.status === "open_exists") setStep("replace");
    else setFailed(true);
  };
  const restart = () => { setStep("entry"); setReason(null); setAnswers(START); setOption(0); setCheck({ warning: false, autoMessages: [], canSkip: false }); };

  const back = (to: Step) => (
    <button type="button" onClick={() => setStep(to)} className="w-max py-1 text-sm font-bold text-teal-700">{t("back")}</button>
  );
  const emergency = (cls = "") => (
    <p role="alert" data-testid="pc-emergency" className={`rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900 ${cls}`}>
      {t("emergencyNow", { number })}
    </p>
  );

  let body: React.ReactNode;
  if (step === "entry") {
    body = (
      <>
        <p className="rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("entryEmergency", { number })}</p>
        <h2 className="text-lg font-extrabold text-slate-900">{t("talkTo", { doctor: page.doctorName })}</h2>
        {page.welcome && <p className="whitespace-pre-line text-sm text-slate-600">{page.welcome}</p>}
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("sla", { n: page.slaBusinessDays })}</b>{t("slaLabel")}</li>
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("hoursTitle")}</b>{t("hoursLabel")}</li>
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("oneTitle")}</b>{t("oneLabel")}</li>
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("privateTitle")}</b>{t("privateLabel")}</li>
        </ul>
        <button type="button" data-testid="pc-start" onClick={() => setStep(page.faq.length > 0 ? "faq" : "reason")} className="mt-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">{t("start")}</button>
      </>
    );
  } else if (step === "faq") {
    body = (
      <>
        {back("entry")}
        <h2 className="text-lg font-extrabold text-slate-900">{t("faqTitle")}</h2>
        {page.faq.map((f) => (
          <details key={f.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold">{f.question}</summary>
            <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{f.answer}</p>
          </details>
        ))}
        <button type="button" data-testid="pc-faq-solved" onClick={() => setStep("resolved")} className="mt-2 rounded-xl border border-teal-600 px-4 py-3 text-sm font-bold text-teal-700">{t("faqSolved")}</button>
        <button type="button" data-testid="pc-faq-continue" onClick={() => setStep("reason")} className="rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">{t("faqContinue")}</button>
      </>
    );
  } else if (step === "reason") {
    body = (
      <>
        {back(page.faq.length > 0 ? "faq" : "entry")}
        <h2 className="text-lg font-extrabold text-slate-900">{t("reasonTitle")}</h2>
        {page.reasons.map((r) => (
          <button key={r.id} type="button" data-testid={`pc-reason-${r.id}`} onClick={() => { setReason(r); setAnswers(START); setOption(0); setStep("form"); }}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-500">
            <span className="min-w-0"><b className="block text-sm text-slate-900">{r.title}</b><span className="text-xs text-slate-500">{r.subtitle}</span></span>
            <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold uppercase text-teal-700">{t("goesTo", { who: r.destination === "secretary" ? t("secretary") : page.doctorName })}</span>
          </button>
        ))}
      </>
    );
  } else if (step === "form" && reason) {
    body = (
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void send(false); }}>
        {back("reason")}
        <h2 className="text-lg font-extrabold text-slate-900">{reason.title}</h2>
        <span className="w-max rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold uppercase text-teal-700">{t("goesTo", { who })}</span>
        {symptomForm ? (
          <>
            <fieldset className="min-w-0">
              <legend className="text-sm text-slate-700">{t("pick")}</legend>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {page.vocabulary.symptoms.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input type="checkbox" checked={answers.symptomIds.includes(s.id)}
                      onChange={(e) => setAnswers({ ...answers, symptomIds: e.target.checked ? [...answers.symptomIds, s.id] : answers.symptomIds.filter((x) => x !== s.id) })} />
                    <span className="min-w-0 break-words">{s.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {warning && emergency()}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {QUESTIONS.map(({ key, n }) => (
                <label key={key} className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">
                  {ta(`${key}Q`)}
                  <select className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={answers[key]}
                    onChange={(e) => setAnswers({ ...answers, [key]: Number(e.target.value) })}>
                    {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{ta(`${key}${i}`)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <SmartTextBox vocab={page.vocabulary} text={answers.text} chips={answers.chips} maxLength={PC_TEXT_MAX}
              label={t("textLabel")} placeholder={t("textPlaceholder")}
              onChange={(text, chips) => setAnswers((a) => ({ ...a, text, chips }))} />
            {check.autoMessages.length > 0 && (
              <div className="flex flex-col gap-2" data-testid="pc-auto">
                {check.autoMessages.map((m) => (
                  <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.tone === "attention" ? "border-amber-400 bg-amber-50" : "border-teal-300 bg-teal-50"}`}>
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">{t("autoWho", { doctor: page.doctorName })}</span>
                    <span className="whitespace-pre-line break-words">{m.text}</span>
                  </div>
                ))}
                {canSkip ? (
                  <>
                    <button type="button" data-testid="pc-skip" onClick={() => setStep("resolved")} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("skip")}</button>
                    <p className="text-xs text-slate-500">{t("general")}</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">{t("generalSend", { doctor: page.doctorName })}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <fieldset className="min-w-0">
            <legend className="text-sm text-slate-700">{t("pickOption")}</legend>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {reason.options.map((o, i) => (
                <label key={o} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="radio" name="pc-option" checked={option === i} onChange={() => setOption(i)} />
                  <span className="min-w-0 break-words">{o}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {failed && <p role="alert" className="text-sm font-semibold text-red-600">{t("sendFailed")}</p>}
        <button type="submit" data-testid="pc-send" disabled={sending} className="mt-1 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {sending ? t("sending") : t("send", { who })}
        </button>
      </form>
    );
  } else if (step === "replace") {
    body = (
      <div className="flex flex-col gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4" data-testid="pc-replace">
        <h2 className="text-base font-bold text-slate-900">{t("openTitle")}</h2>
        <p className="text-sm text-slate-700">{t("openText", { who })}</p>
        <button type="button" data-testid="pc-replace-yes" disabled={sending} onClick={() => void send(true)} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">{t("replace")}</button>
        <button type="button" onClick={() => setStep("form")} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("keep")}</button>
      </div>
    );
  } else if (step === "sent") {
    body = (
      <>
        <p data-testid="pc-sent" className="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-900">{t("sent", { who, n: page.slaBusinessDays })}</p>
        <button type="button" onClick={restart} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("again")}</button>
      </>
    );
  } else {
    body = (
      <>
        <p data-testid="pc-resolved" className="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-900">{t("resolved")}</p>
        <button type="button" onClick={restart} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("again")}</button>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6">
      {banner && <p className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{banner}</p>}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 font-bold text-teal-700">{initials(page.doctorName)}</span>
        <div className="min-w-0"><b className="block break-words text-slate-900">{page.doctorName}</b><span className="text-xs text-slate-500">{page.practiceLine}</span></div>
      </div>
      {body}
    </div>
  );
}

function initials(name: string): string {
  return name.replace(/^(dra?|dr|prof)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
