"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel, formatTimeLabel } from "@/lib/dateLabels";
import { acceptProposal, cancelMyRequest, declineProposal, requestReschedule, getAvailableSlotsForDate } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";
import type { PatientAppointment } from "./page";
import { OnboardingCard } from "@/components/OnboardingCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BrandLogo } from "@/components/BrandLogo";
import { MonthCalendar } from "@/components/MonthCalendar";
import { chosenTimeParts } from "@/lib/chosenTime";
import { addDays, clinicDate, clinicTime, DEFAULT_CLINIC_TZ } from "@/lib/clinicTime";
import { getDayHours, type WorkingHours } from "@/lib/slots";
import { countryProfile } from "@/lib/country";
import { ConsultTypeLabel } from "@/components/ConsultTypeLabel";
import { whoLine } from "@/lib/whoLine";
import { shortDoctorName } from "@/lib/doctorName";
import { MyDoctors } from "./MyDoctors";
import type { MyDoctor } from "@/lib/myDoctors";

const STATUS_COLOR: Record<string, string> = {
  tentative: "bg-amber-50 text-amber-600 border-amber-200",
  proposal:  "bg-blue-50 text-blue-600 border-blue-200",
  scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-300",
  completed: "bg-slate-50 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-500 border-red-200",
  rejected: "bg-red-50 text-red-500 border-red-200",
};

function formatDate(locale: string, dateStr: string) {
  return formatDateLabel(locale, dateStr, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const formatTime = formatTimeLabel;

const STATUS_KEY: Record<string, string> = {
  tentative: "statusTentative", proposal: "statusProposal", scheduled: "statusScheduled",
  confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled",
  late: "statusLate", absent: "statusAbsent", blocked: "statusBlocked",
};

// The same range as the booking page (items 10/22).
const DAYS_AHEAD = 30;

// The next DAYS_AHEAD days on the clinic's calendar, TODAY included (item
// 22: today's remaining times; the server drops the ones already past).
function buildDays(tz: string) {
  const today = clinicDate(new Date(), tz);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
}

function RescheduleDialog({
  appt,
  onClose,
  onSuccess,
  clinicTz,
  practiceCountry,
}: {
  appt: PatientAppointment;
  onClose: () => void;
  onSuccess: () => void;
  clinicTz: string;
  practiceCountry: string | null;
}) {
  const t = useTranslations("myAppointments");
  const tBook = useTranslations("book");
  const locale = useLocale();
  const [days] = useState(() => buildDays(clinicTz));
  const [selectedDate, setSelectedDate] = useState(days[0]);
  // The clinic's working hours: closed days are greyed in the calendar.
  const [hours, setHours] = useState<WorkingHours | null>(null);
  useEffect(() => {
    let alive = true;
    createClient().rpc("get_professional_working_hours", { p_professional_id: appt.professional_id })
      .then(({ data }) => { if (alive) setHours((data ?? {}) as WorkingHours); }, () => { if (alive) setHours({}); });
    return () => { alive = false; };
  }, [appt.professional_id]);
  const isOpen = useCallback((d: string) => hours === null || !!getDayHours(d, hours)?.enabled, [hours]);
  useEffect(() => {
    if (hours && !isOpen(selectedDate)) {
      const first = days.find(isOpen);
      if (first) setSelectedDate(first);
    }
  }, [hours, isOpen, selectedDate, days]);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const seqRef = useRef(0);
  const loadSlots = useCallback(async (date: string) => {
    const seq = ++seqRef.current;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const dur = (() => {
        const [sh, sm] = appt.start_time.split(":").map(Number);
        const [eh, em] = appt.end_time.split(":").map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      })();
      const result = await getAvailableSlotsForDate(appt.professional_id, date, dur || 30);
      if (seq === seqRef.current) setSlots(result);
    } catch { if (seq === seqRef.current) setSlots([]); }
    finally { if (seq === seqRef.current) setLoadingSlots(false); }
    // Primitives, not `appt`: the 60 s refresh (AutoRefresh) hands down a new
    // object, which reloaded the slots and cleared the pick (3e).
  }, [appt.professional_id, appt.start_time, appt.end_time]);

  useEffect(() => { loadSlots(selectedDate); }, [selectedDate, loadSlots]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        data-testid="reschedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-dialog-heading"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="reschedule-dialog-heading" className="text-base font-bold text-slate-900">{t("rescheduleTitle")}</h2>
          <button onClick={onClose} aria-label={t("closeDialog")} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("rescheduleSelectDate")}</p>
        <div className="mb-4">
          <MonthCalendar
            days={days}
            selected={selectedDate}
            onSelect={setSelectedDate}
            isOpen={isOpen}
            locale={locale}
            labels={{ prev: tBook("prevMonth"), next: tBook("nextMonth") }}
          />
        </div>

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("rescheduleSelectTime")}</p>
        {loadingSlots ? (
          <div data-testid="reschedule-skeleton" className="grid grid-cols-4 gap-2 sm:grid-cols-5 mb-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">{selectedDate === days[0] ? tBook("noTimesToday") : t("rescheduleNoSlots")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 mb-4">
            {slots.map(slot => (
              <button
                key={slot.start}
                data-testid="reschedule-slot-chip"
                aria-pressed={selectedSlot?.start === slot.start}
                onClick={() => setSelectedSlot(slot)}
                className={`w-full rounded-lg px-2 py-2 text-sm font-semibold border transition ${
                  selectedSlot?.start === slot.start
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {formatTimeLabel(locale, slot.start)}
              </button>
            ))}
          </div>
        )}

        {selectedSlot && (
          <p data-testid="reschedule-chosen-time" className="mb-3 rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800">
            {tBook("chosenTime", chosenTimeParts(selectedDate, selectedSlot.start, selectedSlot.end, countryProfile(practiceCountry)))}
          </p>
        )}
        <button
          disabled={!selectedSlot || pending}
          data-testid="reschedule-submit-button"
          onClick={() => {
            if (!selectedSlot) return;
            setSubmitError(null);
            startTransition(async () => {
              const result = await requestReschedule(appt.id, selectedDate, selectedSlot.start, selectedSlot.end);
              if (!result.error) { onSuccess(); }
              else { setSubmitError(result.error === "appointment_already_started" ? t("rescheduleStarted") : result.error); }
            });
          }}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 transition"
        >
          {pending ? t("rescheduleSending") : t("rescheduleSend")}
        </button>
        {submitError && (
          <p role="alert" className="mt-2 text-sm text-red-600 text-center">{submitError}</p>
        )}
      </div>
    </div>
  );
}

// Whether a request's asked time (date + HH:MM) has passed on the clinic's clock.
export function requestLapsed(date: string, start: string, now: Date, tz?: string | null): boolean {
  const today = clinicDate(now, tz);
  return date < today || (date === today && start <= clinicTime(now, tz));
}

function AppointmentCard({ appt, onMutate, clinicTz = DEFAULT_CLINIC_TZ, practiceCountry = null }: { appt: PatientAppointment; onMutate: () => void; clinicTz?: string; practiceCountry?: string | null }) {
  const t = useTranslations("myAppointments");
  const tSchedule = useTranslations("schedule");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  // The button tapped shows a spinner; both stay disabled until the list
  // has refreshed (Vitor, item 20), so a second tap can't land meanwhile.
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [actError, setActError] = useState("");
  // A new status from the refresh answers the error (e.g. the clinic had
  // already confirmed: the card's own hint says it; 3e).
  useEffect(() => setActError(""), [appt.status]);
  // "Cancelar pedido" (a pending request only): confirm first.
  const [askCancel, setAskCancel] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const [cancelled, setCancelled] = useState(false);
  const cancelRequest = () => {
    setActError("");
    startCancel(async () => {
      const r = await cancelMyRequest(appt.id);
      setAskCancel(false);
      if (r?.error) { setActError(t("cancelContactClinic")); onMutate(); return; }
      setCancelled(true);
      onMutate();
    });
  };
  const act = (kind: "accept" | "decline") => {
    setActing(kind);
    setActError("");
    startTransition(async () => {
      const r = await (kind === "accept" ? acceptProposal(appt.id) : declineProposal(appt.id));
      // The server refuses a proposal whose time has passed (153).
      if (r?.error === "proposed_time_expired") setActError(t("proposalPassed"));
      onMutate();
    });
  };
  const [showReschedule, setShowReschedule] = useState(false);
  // "Now" is read after mount: the server (UTC) and the browser can disagree
  // on whether an appointment has ended, and that must not change the
  // server-rendered markup (hydration mismatch).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const color = STATUS_COLOR[appt.status] ?? "bg-slate-50 text-slate-500 border-slate-200";
  // A declined request (listed since 150): the patient-facing "Recusado".
  const label = appt.status === "rejected" ? t("statusDeclined") : STATUS_KEY[appt.status] ? tSchedule(STATUS_KEY[appt.status]) : appt.status;
  const isProfProposal = appt.status === "proposal" && appt.scheduled_by !== "patient" && (!!appt.proposed_date || appt.scheduled_by === "professional");
  const isPatientReschedule = appt.status === "proposal" && appt.scheduled_by === "patient";
  // Solicitar remarcação only until the visit STARTS, on the clinic's clock
  // (e7; as the app). The 154 line follows it.
  const canReschedule = (appt.status === "confirmed" || appt.status === "scheduled") && !isPatientReschedule && now !== null && !requestLapsed(appt.date, appt.start_time.slice(0, 5), now, clinicTz);
  // 154: the patient's reschedule request lapsed unanswered and the server
  // put the visit back; a muted line while the visit is still ahead.
  const rescheduleLapsed = !!appt.reschedule_lapsed_at && canReschedule;

  const displayDate = (isProfProposal && appt.proposed_date) ? appt.proposed_date : appt.date;
  const displayStart = (isProfProposal && appt.proposed_start_time) ? appt.proposed_start_time : appt.start_time;
  const displayEnd = (isProfProposal && appt.proposed_end_time) ? appt.proposed_end_time : appt.end_time;
  // A request or proposal whose time has passed (the clinic's clock): "Não
  // confirmado", no actions (as the app; e7). A reschedule the patient asked
  // for is not one: their booking still stands (9a).
  const askedDate = isProfProposal && appt.proposed_date ? appt.proposed_date : appt.date;
  const askedStart = (isProfProposal && appt.proposed_date && appt.proposed_start_time ? appt.proposed_start_time : appt.start_time).slice(0, 5);
  const lapsed = (appt.status === "tentative" || isProfProposal) && now !== null && requestLapsed(askedDate, askedStart, now, clinicTz);

  return (
    <>
    <div data-testid="appointment-card" data-status={lapsed ? "lapsed" : appt.status} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900"><ConsultTypeLabel value={appt.consultation_type} /></p>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDate(locale, displayDate)} · {formatTime(locale, displayStart)} – {formatTime(locale, displayEnd)}
          </p>
          {isProfProposal && appt.proposed_date && (
            <p className="text-xs text-slate-400 mt-0.5">
              {t("originallyLabel", { date: formatDate(locale, appt.date), time: formatTime(locale, appt.start_time) })}
            </p>
          )}
          {isPatientReschedule && appt.proposed_date && (
            <p className="text-xs text-blue-500 mt-0.5 font-medium">
              {t("rescheduleRequestedLabel", { date: formatDate(locale, appt.proposed_date), time: formatTime(locale, appt.proposed_start_time!) })}
            </p>
          )}
          {whoLine(appt.professional_name, appt.clinic_name) && (
            <p data-testid="appointment-who" className="text-sm text-slate-600 mt-0.5">{whoLine(appt.professional_name, appt.clinic_name)}</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">{appt.type === "online" ? tSchedule("online") : tSchedule("inPerson")}</p>
          {/* 150 (item 12): who declined/cancelled, the clinic's reason, and its message. */}
          {(appt.status === "rejected" || appt.status === "cancelled") && appt.status_by && (
            <p data-testid="status-by" className="mt-2 break-words text-sm font-medium text-slate-700">
              {appt.status_by === "patient"
                ? t("youCancelled")
                : appt.status === "rejected"
                  ? (appt.status_reason ? t("declinedByClinicReason", { reason: appt.status_reason }) : t("declinedByClinic"))
                  : (appt.status_reason ? t("cancelledByClinicReason", { reason: appt.status_reason }) : t("cancelledByClinic"))}
            </p>
          )}
          {appt.clinic_message && appt.status !== "rejected" && appt.status !== "cancelled" && (
            <p data-testid="clinic-message" className="mt-2 break-words text-sm text-slate-600">{t("clinicMessage", { message: appt.clinic_message })}</p>
          )}
          {rescheduleLapsed && (
            <p data-testid="reschedule-lapsed" className="mt-2 text-sm text-slate-500">{t("rescheduleLapsed")}</p>
          )}
          {appt.patient_note && (
            <p className="mt-2 text-sm text-slate-600 italic">&ldquo;{appt.patient_note}&rdquo;</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span data-testid="appointment-status-badge" className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${lapsed ? "bg-slate-50 text-slate-500 border-slate-200" : color}`}>
            {lapsed ? t("statusNotConfirmed") : isPatientReschedule ? t("reschedulePending") : label}
          </span>
        </div>
      </div>

      {isProfProposal && !lapsed && (
        <div className="flex gap-2 mt-4">
          <button
            disabled={pending}
            aria-busy={pending && acting === "accept"}
            onClick={() => act("accept")}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 transition"
          >
            {pending && acting === "accept" && <span className="spinner-current mr-2" aria-hidden="true" />}
            {t("accept")}
          </button>
          <button
            disabled={pending}
            aria-busy={pending && acting === "decline"}
            onClick={() => act("decline")}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-50 transition"
          >
            {pending && acting === "decline" && <span className="spinner-current mr-2" aria-hidden="true" />}
            {t("decline")}
          </button>
        </div>
      )}

      {appt.status === "tentative" && !lapsed && !cancelled && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {askCancel ? (
            <div data-testid="cancel-request-confirm" className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{t("cancelRequestTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("cancelRequestBody")}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={cancelling} aria-busy={cancelling} onClick={cancelRequest} className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition">
                  {cancelling && <span className="spinner-current mr-2" aria-hidden="true" />}
                  {t("cancelRequest")}
                </button>
                <button type="button" disabled={cancelling} onClick={() => setAskCancel(false)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50 transition">
                  {t("keepRequest")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" data-testid="cancel-request-button" onClick={() => setAskCancel(true)} className="text-sm font-medium text-red-600 hover:text-red-700 transition">
              {t("cancelRequest")}
            </button>
          )}
        </div>
      )}
      {cancelled && <p role="status" className="mt-2 text-sm font-medium text-slate-600">{t("requestCancelledToast")}</p>}
      {actError && <p role="alert" className="mt-2 text-sm text-red-600">{actError}</p>}

      {canReschedule && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setShowReschedule(true)}
            data-testid="reschedule-request-button"
            className="text-sm font-medium text-slate-500 hover:text-slate-700 transition"
          >
            {t("rescheduleButton")}
          </button>
          <p data-testid="cancel-hint" className="mt-1 text-xs text-slate-400">{t("cancelContactClinic")}</p>
        </div>
      )}
    </div>
    {showReschedule && (
      <RescheduleDialog
        appt={appt}
        onClose={() => setShowReschedule(false)}
        onSuccess={() => { setShowReschedule(false); onMutate(); }}
        clinicTz={clinicTz}
        practiceCountry={practiceCountry}
      />
    )}
    </>
  );
}

export function MyAppointmentsClient({
  upcoming,
  past,
  userEmail,
  myProfessionalId,
  myProfessionalMeta,
  clinicTz = DEFAULT_CLINIC_TZ,
  practiceCountry = null,
  connectedClinicName = null,
  doctors = null,
  canAddDoctor = false,
}: {
  upcoming: PatientAppointment[];
  past: PatientAppointment[];
  userEmail: string;
  myProfessionalId: string | null;
  myProfessionalMeta: { name: string; specialty: string; clinicName?: string } | null;
  // The clinic's zone (its country's): the reschedule's "today".
  clinicTz?: string;
  practiceCountry?: string | null;
  // First-run: the one-time "You're connected to {clinic}" card (null = don't show).
  connectedClinicName?: string | null;
  // 1.5.0 (behind the flag): the patient's doctors; null = as before.
  doctors?: MyDoctor[] | null;
  canAddDoctor?: boolean;
}) {
  const t = useTranslations("myAppointments");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const refresh = () => router.refresh();
  const bookPath = (() => {
    if (!myProfessionalId) return null;
    const params = new URLSearchParams();
    if (myProfessionalMeta?.name) params.set("name", myProfessionalMeta.name);
    if (myProfessionalMeta?.specialty) params.set("specialty", myProfessionalMeta.specialty);
    if (myProfessionalMeta?.clinicName) params.set("clinicName", myProfessionalMeta.clinicName);
    const qs = params.toString();
    return `${prefix}/book/${myProfessionalId}${qs ? `?${qs}` : ""}`;
  })();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/login`);
  }

  // "Always say who": with whom the patient books (Vitor, build 25).
  const doctorName = myProfessionalMeta?.name?.trim() || "";
  // Title + first + last name on buttons (e7: a long name overflowed in the app).
  // With the doctor cards (1.5.0), the same name as the card (the brand's,
  // with its title), not the profile's (f0).
  const labelName = doctors?.[0]?.name?.trim() || doctorName;
  const bookLabel0 = labelName ? t("bookWith", { doctor: shortDoctorName(labelName) }) : t("bookAppointment");
  // 1.5.0: with 2+ doctors the book buttons ask "Com quem?" and lead to the
  // doctor cards (each books with its own doctor); a filter per doctor.
  const tDoctors = useTranslations("patientDoctors");
  const many = !!doctors && doctors.length > 1;
  const bookLabel = many ? tDoctors("bookWho") : bookLabel0;
  const bookHref = many ? "#my-doctors" : bookPath;
  const [only, setOnly] = useState<string | null>(null);
  const shown = (list: PatientAppointment[]) => (many && only ? list.filter((a) => a.professional_id === only) : list);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8" />
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {bookHref && (
              <a
                href={bookHref}
                className="max-w-full line-clamp-2 [overflow-wrap:anywhere] min-w-0 text-right text-sm font-medium text-teal-600 hover:underline"
              >
                {bookLabel}
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-700 transition"
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {connectedClinicName && (
          <OnboardingCard kind="patient_connected" clinicName={connectedClinicName} bookHref={bookHref ?? undefined} bookLabel={bookLabel} />
        )}
        {/* Greeting; the list stays current (item 33). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{userEmail}</p>
          </div>
          <AutoRefresh />
        </div>

        {/* Your doctor: name · specialty · clinic, and booking with them. */}
        {doctors && doctors.length > 0 ? (
          <MyDoctors doctors={doctors} canAdd={canAddDoctor} />
        ) : doctorName && (
          <section data-testid="your-doctor" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("yourDoctor")}</p>
            <p className="mt-1 font-bold text-slate-900">{doctorName}</p>
            {(myProfessionalMeta?.specialty || myProfessionalMeta?.clinicName) && (
              <p className="text-sm text-slate-500">
                {[myProfessionalMeta?.specialty, whoLine(null, myProfessionalMeta?.clinicName) !== doctorName ? myProfessionalMeta?.clinicName : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </section>
        )}

        {many && (
          <div role="radiogroup" aria-label={tDoctors("homeSection")} data-testid="doctor-filter" className="flex flex-wrap gap-2">
            {[{ id: null as string | null, name: tDoctors("filterAll") }, ...doctors!.map((d) => ({ id: d.id as string | null, name: shortDoctorName(d.name) }))].map((c) => (
              <button key={c.id ?? "all"} type="button" role="radio" aria-checked={only === c.id} onClick={() => setOnly(c.id)}
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${only === c.id ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600"}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Upcoming */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("upcoming")}</h2>
          {shown(upcoming).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-slate-300 mb-3">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <p className="font-semibold text-slate-600">{t("noUpcoming")}</p>
              <p className="text-sm text-slate-400 mt-1 mb-5">{t("noUpcomingSub")}</p>
              {bookHref && (
                <a
                  href={bookHref}
                  className="max-w-full line-clamp-2 [overflow-wrap:anywhere] rounded-xl bg-teal-600 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-teal-700 transition"
                >
                  {bookLabel}
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {shown(upcoming).map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} clinicTz={clinicTz} practiceCountry={practiceCountry} />)}
            </div>
          )}
        </section>

        {/* Past */}
        {shown(past).length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("recentHistory")}</h2>
            <div className="space-y-3">
              {shown(past).map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} clinicTz={clinicTz} practiceCountry={practiceCountry} />)}
            </div>
          </section>
        )}

        {/* CTA if no upcoming */}
        {upcoming.length === 0 && bookHref && (
          <div className="rounded-2xl bg-teal-600 p-6 text-white text-center">
            <p className="font-bold text-lg mb-1">{t("ctaTitle")}</p>
            <p className="text-teal-100 text-sm mb-4">{t("ctaSub")}</p>
            <a
              href={bookHref}
              className="max-w-full line-clamp-2 [overflow-wrap:anywhere] rounded-xl bg-white px-5 py-2.5 text-center text-sm font-bold text-teal-700 hover:bg-teal-50 transition"
            >
              {bookLabel}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
