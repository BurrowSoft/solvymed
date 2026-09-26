"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { acceptProposal, declineProposal, requestReschedule, getAvailableSlotsForDate } from "@/app/[locale]/dashboard/schedule/booking-actions";
import type { PatientAppointment } from "./page";
import { OnboardingCard } from "@/components/OnboardingCard";

const STATUS_COLOR: Record<string, string> = {
  tentative: "bg-amber-50 text-amber-600 border-amber-200",
  proposal:  "bg-blue-50 text-blue-600 border-blue-200",
  scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-300",
  completed: "bg-slate-50 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-500 border-red-200",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const STATUS_KEY: Record<string, string> = {
  tentative: "statusTentative", proposal: "statusProposal", scheduled: "statusScheduled",
  confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled",
  late: "statusLate", absent: "statusAbsent", blocked: "statusBlocked",
};

const DAYS_AHEAD = 14;

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDays() {
  const days: string[] = [];
  const today = new Date();
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(localDateStr(d));
  }
  return days;
}

function dayLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function RescheduleDialog({
  appt,
  onClose,
  onSuccess,
}: {
  appt: PatientAppointment;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("myAppointments");
  const days = buildDays();
  const [selectedDate, setSelectedDate] = useState(days[0]);
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
  }, [appt]);

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
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {days.map(day => (
            <button
              key={day}
              data-testid="reschedule-day-chip"
              aria-pressed={selectedDate === day}
              onClick={() => setSelectedDate(day)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                selectedDate === day
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {dayLabel(day)}
            </button>
          ))}
        </div>

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("rescheduleSelectTime")}</p>
        {loadingSlots ? (
          <div className="flex justify-center py-6">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">{t("rescheduleNoSlots")}</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {slots.map(slot => (
              <button
                key={slot.start}
                data-testid="reschedule-slot-chip"
                aria-pressed={selectedSlot?.start === slot.start}
                onClick={() => setSelectedSlot(slot)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold border transition ${
                  selectedSlot?.start === slot.start
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {slot.start.slice(0, 5)}
              </button>
            ))}
          </div>
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
              else { setSubmitError(result.error); }
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

function AppointmentCard({ appt, onMutate }: { appt: PatientAppointment; onMutate: () => void }) {
  const t = useTranslations("myAppointments");
  const tSchedule = useTranslations("schedule");
  const [pending, startTransition] = useTransition();
  const [showReschedule, setShowReschedule] = useState(false);

  const color = STATUS_COLOR[appt.status] ?? "bg-slate-50 text-slate-500 border-slate-200";
  const label = STATUS_KEY[appt.status] ? tSchedule(STATUS_KEY[appt.status]) : appt.status;
  const isProfProposal = appt.status === "proposal" && appt.scheduled_by !== "patient" && (!!appt.proposed_date || appt.scheduled_by === "professional");
  const isPatientReschedule = appt.status === "proposal" && appt.scheduled_by === "patient";
  const now = new Date();
  const apptEndDateTime = new Date(`${appt.date}T${appt.end_time}`);
  const canReschedule = (appt.status === "confirmed" || appt.status === "scheduled") && !isPatientReschedule && apptEndDateTime > now;

  const displayDate = (isProfProposal && appt.proposed_date) ? appt.proposed_date : appt.date;
  const displayStart = (isProfProposal && appt.proposed_start_time) ? appt.proposed_start_time : appt.start_time;
  const displayEnd = (isProfProposal && appt.proposed_end_time) ? appt.proposed_end_time : appt.end_time;

  return (
    <>
    <div data-testid="appointment-card" data-status={appt.status} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900">{appt.consultation_type}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDate(displayDate)} · {formatTime(displayStart)} – {formatTime(displayEnd)}
          </p>
          {isProfProposal && appt.proposed_date && (
            <p className="text-xs text-slate-400 mt-0.5">
              Originally: {formatDate(appt.date)} · {formatTime(appt.start_time)}
            </p>
          )}
          {isPatientReschedule && appt.proposed_date && (
            <p className="text-xs text-blue-500 mt-0.5 font-medium">
              {t("rescheduleRequestedLabel", { date: formatDate(appt.proposed_date), time: formatTime(appt.proposed_start_time!) })}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{appt.type.replace("-", " ")}</p>
          {appt.notes && (
            <p className="mt-2 text-sm text-slate-600 italic">&ldquo;{appt.notes}&rdquo;</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span data-testid="appointment-status-badge" className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}>
            {isPatientReschedule ? t("reschedulePending") : label}
          </span>
        </div>
      </div>

      {isProfProposal && (
        <div className="flex gap-2 mt-4">
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await acceptProposal(appt.id); onMutate(); })}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 transition"
          >
            {t("accept")}
          </button>
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await declineProposal(appt.id); onMutate(); })}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-50 transition"
          >
            {t("decline")}
          </button>
        </div>
      )}

      {canReschedule && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setShowReschedule(true)}
            data-testid="reschedule-request-button"
            className="text-sm font-medium text-slate-500 hover:text-slate-700 transition"
          >
            {t("rescheduleButton")}
          </button>
        </div>
      )}
    </div>
    {showReschedule && (
      <RescheduleDialog
        appt={appt}
        onClose={() => setShowReschedule(false)}
        onSuccess={() => { setShowReschedule(false); onMutate(); }}
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
  connectedClinicName = null,
}: {
  upcoming: PatientAppointment[];
  past: PatientAppointment[];
  userEmail: string;
  myProfessionalId: string | null;
  myProfessionalMeta: { name: string; specialty: string; clinicName?: string } | null;
  // First-run: the one-time "You're connected to {clinic}" card (null = don't show).
  connectedClinicName?: string | null;
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-900">Solvymed</span>
          </div>
          <div className="flex items-center gap-3">
            {bookPath && (
              <a
                href={bookPath}
                className="text-sm font-medium text-teal-600 hover:underline"
              >
                {t("bookAppointment")}
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
          <OnboardingCard kind="patient_connected" clinicName={connectedClinicName} bookHref={bookPath ?? undefined} />
        )}
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{userEmail}</p>
        </div>

        {/* Upcoming */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("upcoming")}</h2>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-slate-300 mb-3">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <p className="font-semibold text-slate-600">{t("noUpcoming")}</p>
              <p className="text-sm text-slate-400 mt-1 mb-5">{t("noUpcomingSub")}</p>
              {bookPath && (
                <a
                  href={bookPath}
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition"
                >
                  {t("bookAppointment")}
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} />)}
            </div>
          )}
        </section>

        {/* Past */}
        {past.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("recentHistory")}</h2>
            <div className="space-y-3">
              {past.map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} />)}
            </div>
          </section>
        )}

        {/* CTA if no upcoming */}
        {upcoming.length === 0 && bookPath && (
          <div className="rounded-2xl bg-teal-600 p-6 text-white text-center">
            <p className="font-bold text-lg mb-1">{t("ctaTitle")}</p>
            <p className="text-teal-100 text-sm mb-4">{t("ctaSub")}</p>
            <a
              href={bookPath}
              className="inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50 transition"
            >
              {t("bookAppointment")}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
