"use client";

import { useRouter, useSearchParams, usePathname, useParams } from "next/navigation";
import { useState, useTransition, useRef, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateLabel } from "@/lib/dateLabels";
import { DateInput } from "@/components/DateInput";
import { PatientPicker } from "./PatientPicker";
import { createAppointment, updateAppointmentStatus, deleteAppointment, blockTime, moveAppointment, searchPatientsForPicker, undoScheduleChange } from "./actions";
import { UNDO_EVENT, offerUndo, type UndoToken } from "@/lib/scheduleUndo";
import { generatePixString, pixQrDataUrl } from "@/lib/pix";
import { generatePromptPayString } from "@/lib/promptpay";
import { toLocalDateString } from "@/lib/slots";
import { dropQueryParam } from "@/lib/dropQueryParam";
import { DEFAULT_OCCURRENCES, MAX_OCCURRENCES, MIN_OCCURRENCES } from "@/lib/recurrence";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/country";
import Link from "next/link";
import { REASON_MAX, statusReasonLive } from "@/lib/statusReason";

type Procedure = { id: string; name: string; duration_minutes: number; price?: number; payment_type: string };
type Appointment = {
  id: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  type: string;
  consultation_type: string;
  payment_status: string;
  payment_amount?: number;
  notes?: string;
};

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-700";
    case "scheduled": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    case "blocked": return "bg-slate-100 text-slate-500";
    case "late": return "bg-orange-100 text-orange-700";
    case "absent": return "bg-red-100 text-red-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

const STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "late", "absent"];

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>;
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${className}`} {...props} />;
}

function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white ${className}`} {...props}>
      {children}
    </select>
  );
}

// Desfazer (UX 2026-09-30, the app's Agenda toast): 10 s after a manual book,
// move or cancel, unless a push already went out. One run per offer; the
// day reloads after it either way.
export function ScheduleUndoToast() {
  const t = useTranslations("schedule");
  const router = useRouter();
  const [token, setToken] = useState<UndoToken | null>(null);
  const [left, setLeft] = useState(0);
  const [phase, setPhase] = useState<"offer" | "undoing" | "done" | "failed">("offer");
  const claimed = useRef<UndoToken | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setToken((e as CustomEvent<UndoToken>).detail); setPhase("offer"); setLeft(10); };
    window.addEventListener(UNDO_EVENT, on);
    return () => window.removeEventListener(UNDO_EVENT, on);
  }, []);
  useEffect(() => {
    if (!token || phase === "undoing") return;
    if (left <= 0) { setToken(null); return; }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [token, left, phase]);

  async function undo() {
    const x = token;
    // Claimed synchronously: a second tap runs nothing.
    if (!x || phase !== "offer" || claimed.current === x) return;
    claimed.current = x;
    setPhase("undoing");
    let ok = false;
    try { ok = (await undoScheduleChange(x)).ok; } catch { ok = false; }
    setPhase(ok ? "done" : "failed");
    setLeft(ok ? 4 : 8);
    router.refresh();
  }

  if (!token) return null;
  const what = token.kind === "booked" ? t("undoBooked") : token.kind === "moved" ? t("undoMoved") : t("undoCancelled");
  // Fixed colours (Vitor 31): the dark theme remaps slate-900 to near-white
  // while white text stays white, which left a blank white box. One line,
  // centred, wrapping only on narrow screens; the button never squeezes.
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center justify-center gap-3 rounded-xl bg-[#0f172a] px-4 py-3 text-sm text-[#ffffff] shadow-lg">
      {phase === "done" ? <span>{t("undoDone")}</span>
        : phase === "failed" ? <span>{t("undoFailed")}</span>
          : (
            <>
              <span className="min-w-0">{what}</span>
              <button type="button" onClick={undo} disabled={phase === "undoing"} className="shrink-0 whitespace-nowrap font-bold text-[#5eead4] hover:text-[#99f6e4] disabled:opacity-60">
                {phase === "undoing" ? "…" : t("undoAction", { s: left })}
              </button>
            </>
          )}
    </div>
  );
}

export function ViewToggle({ currentView, currentDate }: { currentView: string; currentDate: string }) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const pathname = usePathname();
  const views = [
    { id: "list", label: t("list") },
    { id: "day",  label: t("day") },
    { id: "week", label: t("week") },
    { id: "month", label: t("month") },
  ];
  return (
    <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-xs font-semibold shadow-sm">
      {views.map((v, i) => (
        <button
          key={v.id}
          onClick={() => router.push(`${pathname}?date=${currentDate}&view=${v.id}`)}
          className={`px-3.5 py-2 transition ${i > 0 ? "border-l border-slate-200" : ""} ${currentView === v.id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// `today` is the clinic's date from the server, so the server render and
// hydration agree on whether to show "Today" (a browser `new Date()` can be
// a different day than the server's near midnight).
export function ScheduleNav({ currentDate, currentView = "list", today }: { currentDate: string; currentView?: string; today: string }) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function navigate(offset: number) {
    const d = new Date(currentDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    router.push(`${pathname}?date=${toLocalDateString(d)}&view=${currentView}`);
  }

  function goToday() {
    router.push(`${pathname}?date=${today}&view=${currentView}`);
  }

  const formatted = formatDateLabel(locale, currentDate, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const isToday = currentDate === today;

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate(-1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div className="text-center min-w-[220px]">
        <p className="font-bold text-slate-900 text-sm">{formatted}</p>
      </div>
      <button onClick={() => navigate(1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      {!isToday && (
        <button onClick={goToday} className="ml-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition">
          {t("today")}
        </button>
      )}
    </div>
  );
}

const STATUS_KEY: Record<string, string> = {
  tentative: "statusTentative", proposal: "statusProposal", scheduled: "statusScheduled",
  confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled",
  late: "statusLate", absent: "statusAbsent", blocked: "statusBlocked",
};

const ACTION_ERROR_KEY: Record<string, string> = {
  use_booking_card: "useBookingCard",
  missing_fields: "missingFieldsError",
  past_midnight: "pastMidnightError",
  patient_archived: "patientArchivedError",
  generic: "genericError",
};

function actionErrorMessage(t: (key: string) => string, code: string | undefined, tDate?: (key: string) => string): string {
  // A Buddhist-era year (the date field blocks it first; server backstop).
  if (code === "date_buddhist_era" && tDate) return tDate("buddhistYear");
  return t(ACTION_ERROR_KEY[code ?? ""] ?? "genericError");
}

export function AppointmentStatusSelect({ id, current }: { id: string; current: string }) {
  const t = useTranslations("schedule");
  const [status, setStatus] = useState(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // 150 (item 12): a cancel first asks for an optional reason the patient sees.
  const reasonsLive = statusReasonLive();
  const [asking, setAsking] = useState<{ previous: string } | null>(null);
  const [reason, setReason] = useState("");
  // The server's value after a refresh (a Desfazer puts the old one back).
  useEffect(() => { setStatus(current); }, [current]);

  // A tentative/proposal request must go through the booking request card
  // (confirm/reject/propose), which links the patient and notifies them —
  // this plain status control can't do either. Show it as a static badge
  // instead of an interactive control the server would reject anyway.
  if (current === "tentative" || current === "proposal") {
    return (
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(current)}`}>
        {t(STATUS_KEY[current] ?? current)}
      </span>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    const previous = status;
    setStatus(newStatus);
    setError("");
    if (reasonsLive && newStatus === "cancelled") {
      setReason("");
      setAsking({ previous });
      return;
    }
    save(newStatus, previous);
  }

  function save(newStatus: string, previous: string, why?: string) {
    setAsking(null);
    startTransition(async () => {
      const result = await updateAppointmentStatus(id, newStatus, why);
      if (result?.error) {
        setStatus(previous);
        setError(actionErrorMessage(t, result.code));
        return;
      }
      if ("undo" in result) offerUndo(result.undo);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={status}
        onChange={handleChange}
        disabled={pending}
        className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${statusBadge(status)}`}
      >
        {STATUS_OPTIONS.map(s => (
          <option key={s} value={s}>{t(STATUS_KEY[s] ?? s)}</option>
        ))}
      </select>
      {asking && (
        <div className="mt-1 w-64 max-w-full rounded-lg border border-red-100 bg-white p-2 text-left shadow-sm">
          <label htmlFor={`cancel-reason-${id}`} className="block text-xs font-semibold text-slate-700">{t("reasonLabel")}</label>
          <textarea
            id={`cancel-reason-${id}`}
            rows={2}
            maxLength={REASON_MAX}
            placeholder={t("reasonPlaceholderCancel")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">{reason.length}/{REASON_MAX}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => { setStatus(asking.previous); setAsking(null); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{t("keepAppointment")}</button>
              <button type="button" onClick={() => save("cancelled", asking.previous, reason)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">{t("confirmCancel")}</button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 text-right max-w-[160px]">{error}</p>}
    </div>
  );
}

// Remarcar (UX 36): a new date and start, the same duration and details.
// The same checks as booking: another appointment there is a hard stop
// saying with whom; blocked time / outside the working hours asked once.
export function RescheduleButton({ id, date, start }: { id: string; date: string; start: string }) {
  const t = useTranslations("schedule");
  const tDate = useTranslations("dateInput");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState<{ text: string; formData: FormData } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await moveAppointment(formData);
      if (result?.code === "needs_confirm" && "hours" in result) {
        const parts: string[] = [];
        if (result.blocked) parts.push(t("warnBlocked", result.blocked));
        if (result.hours?.kind === "outside") parts.push(t("warnOutside", { start: result.hours.start, end: result.hours.end }));
        if (result.hours?.kind === "day_off") parts.push(t("warnDayOff", { day: result.hours.day }));
        parts.push(t("moveAnyway"));
        setAsk({ text: parts.join(" "), formData });
        return;
      }
      if (result?.code === "slot_overlap" && "overlap" in result) {
        const o = result.overlap;
        setError(o?.name
          ? t("overlapHardMsg", { name: o.name, time: o.time, duration: o.durationMin ? t("durationMinutes", { n: o.durationMin }) : "" })
          : t("overlapGeneric"));
        return;
      }
      if (result?.error) { setError(result.code === "not_movable" ? t("notMovableError") : actionErrorMessage(t, result.code, tDate)); return; }
      setOpen(false);
      if (result && "undo" in result) offerUndo(result.undo);
    });
  }

  function moveAnyway() {
    if (!ask) return;
    const formData = ask.formData;
    formData.set("confirm_warnings", "1");
    setAsk(null);
    submit(formData);
  }

  return (
    <>
      <button onClick={() => { setError(""); setOpen(true); }} title={t("reschedule")} aria-label={t("reschedule")} className="rounded-lg p-1.5 text-slate-300 hover:text-teal-600 hover:bg-teal-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16h6M13 14l2 2-2 2"/>
        </svg>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("rescheduleTitle")}>
        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(new FormData(formRef.current!)); }} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("date")} *</FieldLabel>
              <DateInput name="date" required defaultValue={date} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <FieldLabel>{t("startTime")} *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue={start.slice(0, 5)} />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("rescheduleHint")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : t("reschedule")}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={ask !== null} onClose={() => setAsk(null)} title={t("checkTimeTitle")}>
        <p role="alertdialog" className="text-sm text-slate-700">{ask?.text}</p>
        <div className="flex gap-3 pt-5">
          <button type="button" onClick={() => setAsk(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
          <button type="button" onClick={moveAnyway} disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">{t("reschedule")}</button>
        </div>
      </Dialog>
    </>
  );
}

export function DeleteAppointmentButton({ id }: { id: string }) {
  const t = useTranslations("schedule");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => { await deleteAppointment(id); });
  }

  return (
    <button onClick={handleDelete} disabled={pending} className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    </button>
  );
}

export function NewAppointmentButton({ defaultDate, procedures, label, autoOpen = false, currency = "BRL", prefill }: {
  defaultDate: string;
  // The practice's currency (its country), for procedure prices.
  currency?: Currency;
  procedures: Procedure[];
  // The button's text; the dialog title stays "New appointment".
  label?: string;
  // Open on arrival (the setup checklist links here with ?new=1).
  autoOpen?: boolean;
  // Booking again after a no-show (UX 36: an absent appointment is never
  // moved): the same patient (by id, not editable), procedure and duration;
  // shown as a small icon next to the appointment.
  prefill?: { patientId: string | null; patientName: string; procedureName?: string; duration?: number };
}) {
  const t = useTranslations("schedule");
  const tDate = useTranslations("dateInput");
  const { locale } = useParams<{ locale: string }>();
  const settingsProceduresHref = `${locale === "en" ? "" : `/${locale}`}/dashboard/settings#procedures`;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedProcName, setSelectedProcName] = useState("");
  const [duration, setDuration] = useState("30");
  const [paymentType, setPaymentType] = useState("private");
  const [recurrence, setRecurrence] = useState("");
  const [occurrences, setOccurrences] = useState(String(DEFAULT_OCCURRENCES));
  const uiLocale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  // Patient suggestions come from a server search as the name is typed (a
  // clinic can have thousands of patients; loading all would be capped at
  // 1000): see PatientPicker.

  function handleOpen() {
    const same = prefill?.procedureName ? procedures.find((p) => p.name === prefill.procedureName) ?? null : null;
    const first = same ?? procedures[0] ?? null;
    setSelectedProcName(first?.name ?? "");
    setDuration(String(prefill?.duration ?? first?.duration_minutes ?? 30));
    setPaymentType(first?.payment_type ?? "private");
    setRecurrence("");
    setOccurrences(String(DEFAULT_OCCURRENCES));
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (autoOpen) {
      handleOpen();
      dropQueryParam("new");
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProcChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value;
    setSelectedProcName(name);
    const proc = procedures.find(p => p.name === name);
    if (proc) {
      setDuration(String(proc.duration_minutes));
      setPaymentType(proc.payment_type);
    }
  }

  // Blocked time / outside the working hours: ONE question listing both,
  // then book anyway on [Agendar] (UX 2026-09-28). The form data waits here.
  const [ask, setAsk] = useState<{ text: string; formData: FormData } | null>(null);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createAppointment(formData);
      // In a series, which date (the app names it too).
      const on = (d: string | null | undefined) => (d ? `${t("seriesOnDate", { date: formatDateLabel(uiLocale, d, { day: "2-digit", month: "2-digit", year: "numeric" }) })} ` : "");
      if (result?.code === "needs_confirm" && "hours" in result) {
        const parts: string[] = [];
        if (result.blocked) parts.push(on(result.blocked.date) + t("warnBlocked", { start: result.blocked.start, end: result.blocked.end }));
        const hd = "hoursDate" in result ? result.hoursDate : null;
        if (result.hours?.kind === "outside") parts.push(on(hd) + t("warnOutside", { start: result.hours.start, end: result.hours.end }));
        if (result.hours?.kind === "day_off") parts.push(on(hd) + t("warnDayOff", { day: result.hours.day }));
        parts.push(t("bookAnyway"));
        setAsk({ text: parts.join(" "), formData });
        return;
      }
      // Another appointment is there: a hard stop, saying with whom.
      if (result?.code === "slot_overlap" && "overlap" in result) {
        const o = result.overlap;
        setError(o?.name
          ? on("date" in o ? o.date : null) + t("overlapHardMsg", { name: o.name, time: o.time, duration: o.durationMin ? t("durationMinutes", { n: o.durationMin }) : "" })
          : t("overlapGeneric"));
        return;
      }
      if (result?.code === "invalid_occurrences") { setError(t("occurrencesRange", { min: MIN_OCCURRENCES, max: MAX_OCCURRENCES })); return; }
      if (result?.error) { setError(actionErrorMessage(t, result.code, tDate)); return; }
      setOpen(false);
      if (result && "undo" in result) offerUndo(result.undo);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(new FormData(formRef.current!));
  }

  function bookAnyway() {
    if (!ask) return;
    const formData = ask.formData;
    formData.set("confirm_warnings", "1");
    setAsk(null);
    submit(formData);
  }

  return (
    <>
      {prefill ? (
        <button onClick={handleOpen} title={t("bookAgain")} aria-label={t("bookAgain")} className="rounded-lg p-1.5 text-slate-300 hover:text-teal-600 hover:bg-teal-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/>
          </svg>
        </button>
      ) : (
        <button onClick={handleOpen} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {label ?? t("newAppt")}
        </button>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t("newAppt")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {prefill?.patientId && <input type="hidden" name="patient_id" value={prefill.patientId} />}
          <div>
            <FieldLabel>{t("patientName")} *</FieldLabel>
            {prefill?.patientId ? (
              // The same patient, by id: not editable here.
              <Input name="patient_name" required readOnly value={prefill.patientName} className="bg-slate-50" />
            ) : (
              <PatientPicker
                search={searchPatientsForPicker}
                placeholder={t("patientNamePlaceholder")}
                defaultValue={prefill?.patientName}
                inputClassName="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            )}
          </div>

          <div>
            <FieldLabel>{t("procedure")} *</FieldLabel>
            {procedures.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-700">
                {t("noProcedures")}{" "}
                <Link href={settingsProceduresHref} className="font-semibold underline underline-offset-2">
                  {t("addProcSettings")}
                </Link>{" "}
                {t("beforeScheduling")}
              </div>
            ) : (
              <Select name="consultation_type" value={selectedProcName} onChange={handleProcChange} required>
                {procedures.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name}{p.price ? ` · ${formatMoney(p.price, currency)}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("date")} *</FieldLabel>
              <DateInput name="date" required defaultValue={defaultDate} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <FieldLabel>{t("startTime")} *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="09:00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("duration")}</FieldLabel>
              <Input
                name="duration_minutes"
                type="number"
                min="5"
                max="480"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>{t("type")}</FieldLabel>
              <Select name="type">
                <option value="in-person">{t("inPerson")}</option>
                <option value="online">{t("online")}</option>
              </Select>
            </div>
          </div>

          {/* Repeat (the app's recurrence): every date checked, all or nothing. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("repeat")}</FieldLabel>
              <Select name="recurrence" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                <option value="">{t("noRepeat")}</option>
                <option value="weekly">{t("repeatWeekly")}</option>
                <option value="biweekly">{t("repeatBiweekly")}</option>
                <option value="monthly">{t("repeatMonthly")}</option>
              </Select>
            </div>
            {recurrence && (
              <div>
                <FieldLabel>{t("occurrences")}</FieldLabel>
                <Input name="occurrences" type="number" min={MIN_OCCURRENCES} max={MAX_OCCURRENCES} value={occurrences} onChange={e => setOccurrences(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <FieldLabel>{t("payment")}</FieldLabel>
            <Select name="payment_type" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
              <option value="private">{t("private")}</option>
              <option value="insurance">{t("insurance")}</option>
            </Select>
          </div>

          <div>
            <FieldLabel>{t("notes")}</FieldLabel>
            <textarea name="notes" rows={2} placeholder={t("notesPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending || procedures.length === 0} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : recurrence ? t("saveTimes", { n: parseInt(occurrences, 10) || DEFAULT_OCCURRENCES }) : t("saveAppt")}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={ask !== null} onClose={() => setAsk(null)} title={t("checkTimeTitle")}>
        <p role="alertdialog" className="text-sm text-slate-700">{ask?.text}</p>
        <div className="flex gap-3 pt-5">
          <button type="button" onClick={() => setAsk(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
          <button type="button" onClick={bookAnyway} disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">{t("bookAnywayButton")}</button>
        </div>
      </Dialog>
    </>
  );
}

export function BlockTimeButton({ defaultDate }: { defaultDate: string }) {
  const t = useTranslations("schedule");
  const tDate = useTranslations("dateInput");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await blockTime(formData);
      if (result?.error) { setError(actionErrorMessage(t, result.code, tDate)); return; }
      setOpen(false);
      formRef.current?.reset();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        {t("blockTime")}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("blockTime")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("date")} *</FieldLabel>
              <DateInput name="date" required defaultValue={defaultDate} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <FieldLabel>{t("startTime")} *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="12:00" />
            </div>
          </div>
          <div>
            <FieldLabel>{t("duration")}</FieldLabel>
            <Select name="duration_minutes">
              <option value="30">{t("dur30")}</option>
              <option value="60">{t("dur60")}</option>
              <option value="90">{t("dur90")}</option>
              <option value="120">{t("dur120")}</option>
              <option value="240">{t("dur240")}</option>
            </Select>
          </div>
          <div>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Input name="reason" placeholder={t("reasonPlaceholder")} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-[#334155] py-2.5 text-sm font-bold text-[#ffffff] hover:bg-[#1e293b] transition disabled:opacity-60">
              {pending ? t("saving") : t("blockTime")}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function PixQrButton({
  pixKey,
  clinicName,
  clinicCity,
  amount,
}: {
  pixKey: string;
  clinicName: string;
  clinicCity: string;
  amount?: number;
}) {
  const t = useTranslations("schedule");
  // "QR Code Pix" in Portuguese, "Pix QR code" elsewhere (UX).
  const title = t("pixQrTitle");
  const [open, setOpen] = useState(false);
  const pixStr = generatePixString(pixKey, clinicName, clinicCity, amount);
  // Built in the page, only while the dialog is open (one per appointment row).
  const qrUrl = open ? pixQrDataUrl(pixStr) : "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={title}
        className="rounded-lg p-1.5 text-teal-500 hover:bg-teal-50 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" rx="0.5"/>
          <rect x="19" y="14" width="2" height="2" rx="0.5"/><rect x="14" y="19" width="2" height="2" rx="0.5"/>
          <rect x="18" y="18" width="3" height="3" rx="0.5"/>
        </svg>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col items-center gap-4">
          {/* Natural size (5 px modules): scaling it down would blur the
              modules below the 4 px phones need to scan it reliably. */}
          <img src={qrUrl} alt={title} className="max-w-full rounded-xl border border-slate-100 [image-rendering:pixelated]" />
          <div className="w-full">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{t("pixCopyPaste")}</p>
            <div className="relative">
              <textarea
                readOnly
                value={pixStr}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-600 font-mono resize-none focus:outline-none"
              />
              <button
                onClick={() => navigator.clipboard.writeText(pixStr)}
                className="absolute top-2 right-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                {t("pixCopy")}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

// PromptPay (Thailand's payment QR) for a Thai practice, with the
// appointment's amount in THB. Same QR rendering as Pix (built in the page,
// never sent to a QR service).
export function PromptPayQrButton({ promptPayId, amount }: { promptPayId: string; amount?: number }) {
  const t = useTranslations("schedule");
  const [open, setOpen] = useState(false);
  const payload = generatePromptPayString(promptPayId, amount);
  const qrUrl = open ? pixQrDataUrl(payload) : "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t("promptPayTitle")}
        aria-label={t("promptPayTitle")}
        className="rounded-lg p-1.5 text-teal-500 hover:bg-teal-50 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" rx="0.5"/>
          <rect x="19" y="14" width="2" height="2" rx="0.5"/><rect x="14" y="19" width="2" height="2" rx="0.5"/>
          <rect x="18" y="18" width="3" height="3" rx="0.5"/>
        </svg>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("promptPayTitle")}>
        <div className="flex flex-col items-center gap-4">
          {/* Natural size, as for Pix (5 px modules). */}
          <img src={qrUrl} alt={t("promptPayTitle")} className="max-w-full rounded-xl border border-slate-100 [image-rendering:pixelated]" />
          {amount != null && amount > 0 && <p className="text-lg font-bold text-slate-900">{formatMoney(amount, "THB")}</p>}
          <p className="text-center text-sm text-slate-500">{t("promptPayScan")}</p>
        </div>
      </Dialog>
    </>
  );
}
