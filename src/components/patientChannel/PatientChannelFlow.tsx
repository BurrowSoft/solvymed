"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { immediateWarning, type AnswerKey, type Answers } from "@/lib/patientChannel/score";
import { PC_TEXT_MAX, type PcMyRequest, type PcMyRequestsFn, type PcPatientPage, type PcPreview, type PcPreviewFn, type PcReason, type PcSelfServeFn, type PcSubmitFn } from "@/lib/patientChannel/patientPage";
import { dateLocale } from "@/lib/dateLabels";
import { SmartTextBox } from "./SmartTextBox";
import { readingHoursLines } from "@/lib/patientChannel/readingHours";
import { MyRequests } from "./MyRequests";
import { PcPageFrame } from "./PcPageFrame";

// The part of the page the patient sees, in the layout viewport's coordinates: with the
// keyboard open, iOS keeps the layout viewport and moves the visual one (visualViewport).
function visibleArea() {
  const v = typeof window !== "undefined" ? window.visualViewport : null;
  return v ? { top: v.offsetTop, bottom: v.offsetTop + v.height } : { top: 0, bottom: window.innerHeight };
}
const motion = (): ScrollBehavior =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
// One line of the bar's text-sm.
const BAR_LINE = 20;

// The patient's Patient Channel (specs/patient-contact-tech.md §6; the prototype v17's
// tab 1), phone first: entry (the rules, the response time, the practice country's
// emergency number) → FAQ → reason (→ who it goes to) → the form → sent (one open request
// at a time; "replace?" when one is open). The patient never sees a score or a band.
// The emergency warning shows at once from the vocabulary (immediate-warning symptoms,
// offline too) and from /preview (red); the automatic messages and "I don't need to send"
// come only from /preview, and the skip is never offered with a warning or when red.

type Step = "entry" | "faq" | "reason" | "form" | "sent" | "replace" | "resolved" | "unavailable" | "rateLimited";
const QUESTIONS: { key: AnswerKey; n: number }[] = [
  { key: "when", n: 3 },
  { key: "intensity", n: 3 },
  { key: "stillTaking", n: 2 },
];
// Nothing preselected (launch polish 15): -1 = not answered, which adds 0 points (score.ts) and
// matches only an automatic message that accepts any answer (255 accepts -1).
const START: Answers = { symptomIds: [], chips: [], when: -1, intensity: -1, stillTaking: -1, text: "" };
const PREVIEW_MS = 300;

export function PatientChannelFlow({ page, preview, submit, banner, onSelfServe, loadRequests }: {
  page: PcPatientPage;
  preview: PcPreviewFn;
  submit: PcSubmitFn;
  // "This answered my question": counted for the doctor (no content), §4.7 /selfserve.
  onSelfServe?: PcSelfServeFn;
  // The patient's requests with this practice: "Suas mensagens" on the first screen (P-14)
  // and the open one on the "sent too many times" screen (01).
  loadRequests?: PcMyRequestsFn;
  // The preview test's "sample data, nothing is sent" bar.
  banner?: string;
}) {
  const t = useTranslations("patientChannel.patient");
  const ta = useTranslations("patientChannel.answers");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("entry");
  const [reason, setReason] = useState<PcReason | null>(null);
  const [answers, setAnswers] = useState<Answers>(START);
  const [option, setOption] = useState(0);
  const [check, setCheck] = useState<PcPreview>({ warning: false, autoMessages: [], canSkip: false });
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requests, setRequests] = useState<PcMyRequest[] | null>(null);
  const openRequest = requests?.find((r) => r.status === "open") ?? null;
  const number = page.emergencyNumber ?? t("localNumber");
  const hoursLines = readingHoursLines(page.readingHours ?? [], locale);
  const symptomForm = reason?.kind === "symptom_form";
  const who = reason?.destination === "secretary" ? t("secretary") : page.doctorName;
  // The front desk in a sentence takes its article ("para a secretaria", "A secretaria responde";
  // launch polish 18): its own keys, never {who} = "Secretaria".
  const toSecretary = reason?.destination === "secretary";
  // One open request per DESTINATION (255): the one to replace always goes where the new one
  // goes, so "Quer atualizar a que já está com {who}?" names the new reason's destination, and
  // the prompt names that open request (launch polish 2): from the 409, else the patient's own
  // list (the open one with this destination).
  const openToSecretary = toSecretary;
  const openWho = openToSecretary ? t("secretary") : page.doctorName;
  const [openNamed, setOpenNamed] = useState<{ reasonTitle: string; createdAt: string } | null>(null);
  const sameDestOpen = requests?.find((r) => r.status === "open" && (r.destination ?? "doctor") === (reason?.destination ?? "doctor")) ?? null;
  const openShown = openNamed ?? (sameDestOpen ? { reasonTitle: sameDestOpen.reasonTitle, createdAt: sameDestOpen.createdAt } : null);

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
  // When the emergency line FIRST appears (01; the app does the same), bring it into view if
  // it's off-screen: at phone width it sits below the symptom list. role="alert" announces it
  // as it appears; the motion follows prefers-reduced-motion.
  // While the patient TYPES (01, 10-27; web tester 1's 320 check): the line sits above the
  // questions, so scrolling to it would push the text box behind the keyboard. Then nothing
  // scrolls: a compact bar pinned to the top of the visible area repeats the line while it's
  // off-screen (aria-hidden: the line's role="alert" already announced it), and a tap goes to
  // it. The box wins: when the 2-line bar would cover it, the bar shrinks to 1 line. The
  // emergency number sits outside the clamp, so it always shows.
  const emergencyRef = useRef<HTMLParagraphElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);
  const [bar, setBar] = useState<{ top: number; lines: 1 | 2 } | null>(null);
  const wasWarning = useRef(false);
  useEffect(() => {
    if (warning && !wasWarning.current) {
      const el = emergencyRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const area = visibleArea();
        if (r.top < area.top || r.bottom > area.bottom) {
          if (textRef.current?.contains(document.activeElement)) setBar({ top: area.top, lines: 2 });
          else el.scrollIntoView({ behavior: motion(), block: "center" });
        }
      }
    }
    if (!warning) setBar(null);
    wasWarning.current = !!warning;
  }, [warning]);
  const barOn = bar !== null;
  useEffect(() => {
    if (!barOn) return;
    const update = () => {
      const line = emergencyRef.current;
      const area = visibleArea();
      const r = line?.getBoundingClientRect();
      if (!r || (r.top >= area.top && r.bottom <= area.bottom)) { setBar(null); return; }
      const box = textRef.current?.querySelector("textarea")?.getBoundingClientRect();
      const height = barRef.current?.getBoundingClientRect().height ?? 0;
      setBar((cur) => {
        if (!cur) return cur;
        // The 2-line height: as measured, or the 1-line bar plus one line of text.
        const two = cur.lines === 2 ? height : height + BAR_LINE;
        const lines: 1 | 2 = box && area.top + two > box.top ? 1 : 2;
        return cur.top === area.top && cur.lines === lines ? cur : { top: area.top, lines };
      });
    };
    update();
    const vv = window.visualViewport;
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    vv?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      vv?.removeEventListener("resize", update);
    };
  }, [barOn]);
  // While the emergency line shows, only "attention" automatic messages stay: an "info" one
  // ("Enjoo leve é comum…") next to it mixes signals (launch polish 4).
  const autoShown = warning ? check.autoMessages.filter((m) => m.tone !== "info") : check.autoMessages;
  const canSkip = symptomForm && check.canSkip && !warning && check.autoMessages.length > 0;
  // An urgent send (the line was shown): the confirmation repeats it (launch polish 1).
  const [sentWarning, setSentWarning] = useState(false);
  // The send replaced the open request: the confirmation says so (launch polish 21).
  const [sentReplaced, setSentReplaced] = useState(false);

  const send = async (replace: boolean) => {
    if (!reason || sending) return;
    setSending(true);
    setFailed(false);
    // Kept with the request as shown: the ones the patient actually saw.
    const shown = symptomForm ? autoShown.map((m) => m.id) : [];
    const r = await submit(reason.id, symptomForm ? answers : { option: reason.options[option] ?? "" }, replace, shown).catch(() => ({ status: "error" as const }));
    setSending(false);
    if (r.status === "sent") { setSentWarning(!!warning); setSentReplaced(replace); setStep("sent"); }
    else if (r.status === "open_exists") {
      setOpenNamed(r.open ?? null);
      setStep("replace");
      // The open request may be newer than the list read on the first screen.
      void loadRequests?.().then(setRequests).catch(() => undefined);
    }
    else if (r.status === "unavailable") setStep("unavailable");
    else if (r.status === "rate_limited") {
      setStep("rateLimited");
      void loadRequests?.().then(setRequests).catch(() => undefined);
    }
    else setFailed(true);
  };
  // "Suas mensagens": read each time the first screen shows (a reply that came meanwhile
  // appears when the patient comes back to it).
  useEffect(() => {
    if (step !== "entry" || !loadRequests) return;
    let live = true;
    void loadRequests().then((r) => { if (live) setRequests(r); }).catch(() => undefined);
    return () => { live = false; };
  }, [step, loadRequests]);

  const restart = () => { setStep("entry"); setReason(null); setAnswers(START); setOption(0); setCheck({ warning: false, autoMessages: [], canSkip: false }); setSentWarning(false); setSentReplaced(false); setOpenNamed(null); };

  const back = (to: Step) => (
    <button type="button" onClick={() => setStep(to)} className="w-max py-1 text-sm font-bold text-teal-700">{t("back")}</button>
  );
  const emergency = (cls = "", ref?: React.Ref<HTMLParagraphElement>) => (
    <p ref={ref} role="alert" data-testid="pc-emergency" className={`rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900 ${cls}`}>
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
          {/* The doctor's real reading hours when set (launch polish 20), else the general line. */}
          <li className="rounded-xl bg-teal-50 px-3 py-2" data-testid="pc-hours">
            <b className="block text-teal-800">{t("hoursTitle")}</b>
            {hoursLines.length > 0 ? hoursLines.map((l) => <span key={l} className="block">{l}</span>) : t("hoursLabel")}
            {page.readingNote && <span className="block text-xs text-teal-900/80">{page.readingNote}</span>}
          </li>
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("oneTitle")}</b>{t("oneLabel")}</li>
          <li className="rounded-xl bg-teal-50 px-3 py-2"><b className="block text-teal-800">{t("privateTitle")}</b>{t("privateLabel")}</li>
        </ul>
        {requests && requests.length > 0 && <MyRequests requests={requests} timeZone={page.timeZone} country={page.country} />}
        <button type="button" data-testid="pc-start" onClick={() => setStep(page.faq.length > 0 ? "faq" : "reason")} className="mt-2 rounded-xl bg-[var(--pc-brand)] px-4 py-3 text-sm font-bold text-[var(--pc-ink)]">{t("start")}</button>
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
        <button type="button" data-testid="pc-faq-solved" onClick={() => { onSelfServe?.("faq_resolved"); setStep("resolved"); }} className="mt-2 rounded-xl border border-teal-600 px-4 py-3 text-sm font-bold text-teal-700">{t("faqSolved")}</button>
        <button type="button" data-testid="pc-faq-continue" onClick={() => setStep("reason")} className="rounded-xl bg-[var(--pc-brand)] px-4 py-3 text-sm font-bold text-[var(--pc-ink)]">{t("faqContinue")}</button>
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
            <span className="min-w-0 flex-1"><b className="block text-sm text-slate-900">{r.title}</b><span className="text-xs text-slate-500">{r.subtitle}</span></span>
            {/* The title keeps the room: the chip is capped and cut with "…", in normal case, so a
                long doctor's name never pushes the title to 2 lines at 360 (launch polish 22). */}
            <span className="max-w-[45%] truncate rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700" data-testid={`pc-reason-to-${r.id}`}>{r.destination === "secretary" ? t("goesToSecretary") : t("goesTo", { who: page.doctorName })}</span>
          </button>
        ))}
      </>
    );
  } else if (step === "form" && reason) {
    body = (
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void send(false); }}>
        {back("reason")}
        <h2 className="text-lg font-extrabold text-slate-900">{reason.title}</h2>
        <span className="w-max rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold uppercase text-teal-700">{toSecretary ? t("goesToSecretary") : t("goesTo", { who })}</span>
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
            {warning && emergency("", emergencyRef)}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {QUESTIONS.map(({ key, n }) => (
                <label key={key} className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">
                  {ta(`${key}Q`)}
                  <select className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={answers[key]}
                    onChange={(e) => setAnswers({ ...answers, [key]: Number(e.target.value) })}>
                    <option value={-1}>{ta("choose")}</option>
                    {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{ta(`${key}${i}`)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div ref={textRef} className="min-w-0">
              <SmartTextBox vocab={page.vocabulary} text={answers.text} chips={answers.chips} maxLength={PC_TEXT_MAX}
                label={t("textLabel")} placeholder={t("textPlaceholder")}
                onChange={(text, chips) => setAnswers((a) => ({ ...a, text, chips }))} />
            </div>
            {/* M7 / PC-10′: with the doctor's AI option on, the form says so. */}
            {page.aiNotice && <p className="text-xs text-slate-500" data-testid="pc-ai-notice">{t("aiNotice")}</p>}
            {warning && bar && createPortal(
              <button ref={barRef} type="button" aria-hidden="true" tabIndex={-1} data-testid="pc-emergency-bar"
                onClick={() => emergencyRef.current?.scrollIntoView({ behavior: motion(), block: "center" })}
                style={{ top: bar.top }}
                className="fixed inset-x-0 z-50 flex items-start gap-2 border-b-2 border-red-600 bg-red-50 px-3 py-2 text-left text-sm font-semibold text-red-900 shadow-md">
                <span className="shrink-0">⚠</span>
                {/* The number outside the clamp (cf): it shows even when the sentence is cut short.
                    Only a real number (as the app): the "local emergency number" phrase stays in the sentence. */}
                {page.emergencyNumber && <b data-testid="pc-emergency-bar-number" className="shrink-0 tabular-nums">{page.emergencyNumber}</b>}
                <span className={bar.lines === 2 ? "line-clamp-2" : "line-clamp-1"}>{t("emergencyNow", { number })}</span>
              </button>,
              document.body,
            )}
            {autoShown.length > 0 && (
              <div className="flex flex-col gap-2" data-testid="pc-auto">
                {autoShown.map((m) => (
                  <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.tone === "attention" ? "border-amber-400 bg-amber-50" : "border-teal-300 bg-teal-50"}`}>
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">{t("autoWho", { doctor: page.doctorName })}</span>
                    <span className="whitespace-pre-line break-words">{m.text}</span>
                  </div>
                ))}
                {canSkip ? (
                  <>
                    <button type="button" data-testid="pc-skip" onClick={() => { onSelfServe?.("auto_resolved"); setStep("resolved"); }} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("skip")}</button>
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
        <button type="submit" data-testid="pc-send" disabled={sending} className="mt-1 rounded-xl bg-[var(--pc-brand)] px-4 py-3 text-sm font-bold text-[var(--pc-ink)] disabled:opacity-60">
          {sending ? t("sending") : toSecretary ? t("sendSecretary") : t("send", { who })}
        </button>
      </form>
    );
  } else if (step === "replace") {
    body = (
      <div className="flex flex-col gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4" data-testid="pc-replace">
        <h2 className="text-base font-bold text-slate-900">{t("openTitle")}</h2>
        {/* Which request would be replaced (launch polish 2). */}
        {openShown && (
          <p className="text-sm font-semibold text-slate-900" data-testid="pc-replace-open">
            {t("openExistsNamed", { reason: openShown.reasonTitle, date: formatWhen(openShown.createdAt, locale) })}
          </p>
        )}
        <p className="text-sm text-slate-700">{openToSecretary ? t("openTextSecretary") : t("openText", { who: openWho })}</p>
        <button type="button" data-testid="pc-replace-yes" disabled={sending} onClick={() => void send(true)} className="rounded-xl bg-[var(--pc-brand)] px-4 py-2.5 text-sm font-bold text-[var(--pc-ink)]">{t("replace")}</button>
        <button type="button" onClick={() => setStep("form")} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("keep")}</button>
      </div>
    );
  } else if (step === "sent") {
    body = (
      <>
        {/* The last screen the patient reads after an urgent send: don't wait, call (01's line). */}
        {sentWarning && (
          <p role="alert" data-testid="pc-sent-urgent" className="rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("sentUrgent", { number })}</p>
        )}
        <p data-testid="pc-sent" className="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-900">
          {toSecretary ? t("sentSecretary", { n: page.slaBusinessDays }) : t("sent", { who, n: page.slaBusinessDays })}
          {sentReplaced && <span className="mt-1 block" data-testid="pc-sent-replaced">{t("replacedPrevious")}</span>}
        </p>
        <button type="button" onClick={restart} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("again")}</button>
      </>
    );
  } else if (step === "rateLimited") {
    body = (
      <div className="flex flex-col gap-3" data-testid="pc-rate-limited">
        <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{t("rateLimited")}</p>
        <p className="rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("urgentCall", { number })}</p>
        {openRequest && (
          <div data-testid="pc-open-request" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <span className="block text-xs text-slate-500">{t("openRequest")}</span>
            <b className="block break-words">{openRequest.reasonTitle}</b>
            <span className="text-xs text-slate-500">{t("sentAt", { when: formatWhen(openRequest.createdAt, locale) })}</span>
          </div>
        )}
        <button type="button" onClick={restart} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("again")}</button>
      </div>
    );
  } else if (step === "unavailable") {
    body = <ChannelUnavailableBody emergencyNumber={number} />;
  } else {
    body = (
      <>
        <p data-testid="pc-resolved" className="rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-900">{t("resolved")}</p>
        <button type="button" onClick={restart} className="rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-bold text-teal-700">{t("again")}</button>
      </>
    );
  }

  // The doctor's page look (prototype v17), shared with "Testar como paciente" (PcPageFrame).
  return (
    <PcPageFrame
      look={page.look}
      doctorName={page.doctorName}
      practiceLine={page.practiceLine}
      banner={banner && <p className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{banner}</p>}
      className="mx-auto w-full max-w-xl"
      testId="pc-page"
    >
      {body}
    </PcPageFrame>
  );
}

// The practice closed or the patient was archived (237): no channel, the emergency
// notice stays (01).
export function ChannelUnavailableBody({ emergencyNumber }: { emergencyNumber: string }) {
  const t = useTranslations("patientChannel.patient");
  return (
    <div className="flex flex-col gap-3" data-testid="pc-unavailable">
      <p className="rounded-xl border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("entryEmergency", { number: emergencyNumber })}</p>
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">{t("unavailable")}</p>
    </div>
  );
}

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "short", timeStyle: "short" }).format(d);
}

