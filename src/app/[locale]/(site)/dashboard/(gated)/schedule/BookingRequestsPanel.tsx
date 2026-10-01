"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePatientIdFields } from "@/lib/usePatientIdFields";
import type { PatientIdKind } from "@/lib/patientIds";
import { formatDateLabel, formatShortDate, formatTimeLabel } from "@/lib/dateLabels";
import { createClient } from "@/lib/supabase/client";
import { confirmBookingAndAddPatient, rejectBooking, proposeNewTime, acceptRescheduleRequest, declineRescheduleRequest } from "./booking-actions";
import { toLocalDateString } from "@/lib/slots";
import { looksBuddhistEra } from "@/lib/buddhistEra";
import { DateInput } from "@/components/DateInput";
import { REASON_MAX, statusReasonLive } from "@/lib/statusReason";

type Booking = {
  id: string;
  patient_name: string;
  patient_auth_id?: string | null;
  patient_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  consultation_type: string;
  status: string;
  notes?: string | null;
  patient_note?: string | null;
  is_new_patient?: boolean;
  scheduled_by?: string | null;
  proposed_date?: string | null;
  proposed_start_time?: string | null;
  proposed_end_time?: string | null;
};

type PatientProfile = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  th_national_id?: string | null;
  passport_number?: string | null;
};

// idKind: the practice country's patient identifier (lib/patientIds).
export function BookingRequestsPanel({ bookings, idKind = "BR" }: { bookings: Booking[]; idKind?: PatientIdKind }) {
  const t = useTranslations("schedule");
  // Only the practice country's ID columns are read (pre-110: CPF only).
  const idFields = usePatientIdFields(idKind);
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [isPending, startTransition] = useTransition();
  // Which button is working (Vitor, item 20): it shows a spinner while the
  // transition runs, and every button stays disabled until the action and
  // the list refresh are done.
  const [acting, setActing] = useState<string | null>(null);
  const spin = (key: string) => (isPending && acting === key ? <span className="spinner-current mr-1.5" aria-hidden="true" /> : null);
  // 150 (item 12): Reject first asks for an optional reason the patient sees;
  // the note below becomes the message to the patient (on their card).
  const reasonsLive = statusReasonLive();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // "Now" is read after mount: the server (UTC) and a browser in another
  // zone disagree on which requests are past, which would reorder and
  // restyle the list between the server render and hydration (React #418).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [propDate, setPropDate] = useState("");
  const [propStart, setPropStart] = useState("");
  const [propEnd, setPropEnd] = useState("");

  const [notes, setNotes] = useState<Record<string, string>>({});
  // patient info panel toggle + lazy-loaded profiles
  const [infoId, setInfoId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PatientProfile | null>>({});
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  async function handleInfoToggle(b: Booking) {
    const next = infoId === b.id ? null : b.id;
    setInfoId(next);
    if (next && b.patient_auth_id && !(b.id in profiles)) {
      setLoadingProfile(b.id);
      const supabase = createClient();
      const { data } = await supabase
        .from("patient_profiles")
        .select(["full_name", "email", "phone", "birth_date", ...idFields.map((f) => f.name)].join(", "))
        .eq("user_id", b.patient_auth_id)
        .maybeSingle();
      setProfiles(prev => ({ ...prev, [b.id]: data as PatientProfile | null }));
      setLoadingProfile(null);
    }
  }

  if (!bookings.length) return null;

  const todayStr = now ? toLocalDateString(now) : "";
  const nowHHMM = now ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "";

  function isObsolete(b: Booking): boolean {
    if (!now) return false;
    const isPatientProposal = b.status === "proposal" && b.scheduled_by === "patient";
    const checkDate = isPatientProposal && b.proposed_date ? b.proposed_date : b.date;
    const checkEnd  = isPatientProposal && b.proposed_end_time ? b.proposed_end_time : b.end_time;
    return checkDate < todayStr || (checkDate === todayStr && checkEnd.slice(0, 5) < nowHHMM);
  }

  const sortedBookings = [...bookings].sort((a, b) => {
    const aObs = isObsolete(a) ? 1 : 0;
    const bObs = isObsolete(b) ? 1 : 0;
    if (aObs !== bObs) return aObs - bObs;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.start_time < b.start_time ? -1 : 1;
  });

  function handleConfirmClick(b: Booking) {
    const note = notes[b.id] || undefined;
    setActing(`confirm:${b.id}`);
    startTransition(async () => {
      const result = await confirmBookingAndAddPatient(b.id, note);
      // The patient's record at this clinic is archived (server-enforced).
      if (result?.error === "patient_archived") alert(t("patientArchivedError"));
    });
  }

  function handleReject(id: string) {
    const note = (reasonsLive ? reasons[id] : notes[id]) || undefined;
    setRejectingId(null);
    setActing(`reject:${id}`);
    startTransition(async () => { await rejectBooking(id, note); });
  }

  function handleProposeSubmit(id: string) {
    if (!propDate || !propStart || !propEnd || looksBuddhistEra(propDate)) return;
    const note = notes[id] || undefined;
    startTransition(async () => {
      const result = await proposeNewTime(id, propDate, propStart, propEnd, note);
      if (result?.error === "patient_archived") alert(t("patientArchivedError"));
      setProposalId(null);
    });
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="mb-3 text-base font-bold text-slate-800">
          {t("bookingRequests")}
          <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
            {bookings.length}
          </span>
        </h2>

        <div className="flex flex-col gap-3">
          {sortedBookings.map(b => {
            const obsolete = isObsolete(b);
            return (
            <div key={b.id} data-testid="booking-request-row" className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm${obsolete ? " opacity-45" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{b.patient_name}</p>
                    {b.is_new_patient && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                        {t("newPatient")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {formatDateLabel(locale, b.date)} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                  </p>
                  <p className="text-sm text-slate-500">{b.consultation_type}</p>
                  {b.patient_note && (
                    <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">{t("patientMessage")}:</span> <span className="italic">{b.patient_note}</span></p>
                  )}
                  {b.notes && (
                    <p className="mt-1 text-xs text-slate-400 italic">{b.notes}</p>
                  )}
                  {b.status === "proposal" && b.scheduled_by !== "patient" && (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {t("waitingForResponse")}
                    </span>
                  )}
                  {/* The clinic's proposal: the time it proposed, not just the original (UX 36). */}
                  {b.status === "proposal" && b.scheduled_by !== "patient" && b.proposed_date && b.proposed_start_time && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("proposedLabel", {
                        date: formatDateLabel(locale, b.proposed_date),
                        time: formatTimeLabel(locale, b.proposed_start_time),
                      })}
                    </p>
                  )}
                  {b.status === "proposal" && b.scheduled_by === "patient" && (
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {t("rescheduleRequested")}
                    </span>
                  )}
                  {b.status === "proposal" && b.scheduled_by === "patient" && b.proposed_date && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("requestedLabel", {
                        date: formatDateLabel(locale, b.proposed_date),
                        time: b.proposed_start_time ? formatTimeLabel(locale, b.proposed_start_time) : "",
                      })}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {/* Patient Information toggle */}
                  <button
                    onClick={() => handleInfoToggle(b)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {t("patientInfo")}
                  </button>

                  {obsolete && !(b.status === "proposal" && b.scheduled_by === "patient") ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProposalId(proposalId === b.id ? null : b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {t("proposeNewTime")}
                      </button>
                      <button
                        onClick={() => { setActing(`dismiss:${b.id}`); startTransition(async () => { await rejectBooking(b.id, undefined); }); }}
                        disabled={isPending}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {spin(`dismiss:${b.id}`)}{t("dismiss")}
                      </button>
                    </div>
                  ) : (
                    <>
                  {b.status === "tentative" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmClick(b)}
                        disabled={isPending}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {spin(`confirm:${b.id}`)}{t("confirm")}
                      </button>
                      <button
                        onClick={() => setProposalId(proposalId === b.id ? null : b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {t("proposeNewTime")}
                      </button>
                      <button
                        onClick={() => (reasonsLive ? setRejectingId(rejectingId === b.id ? null : b.id) : handleReject(b.id))}
                        disabled={isPending}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {spin(`reject:${b.id}`)}{t("reject")}
                      </button>
                    </div>
                  )}

                  {reasonsLive && rejectingId === b.id && (
                    <div className="mt-1 rounded-lg border border-red-100 bg-red-50/50 p-2">
                      <label htmlFor={`reason-${b.id}`} className="block text-xs font-semibold text-slate-700">{t("reasonLabel")}</label>
                      <textarea
                        id={`reason-${b.id}`}
                        rows={2}
                        maxLength={REASON_MAX}
                        placeholder={t("reasonPlaceholderDecline")}
                        value={reasons[b.id] ?? ""}
                        onChange={e => setReasons(prev => ({ ...prev, [b.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                      />
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">{(reasons[b.id] ?? "").length}/{REASON_MAX}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setRejectingId(null)} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{t("keepAppointment")}</button>
                          <button type="button" onClick={() => handleReject(b.id)} disabled={isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">{spin(`reject:${b.id}`)}{t("reject")}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {b.status === "tentative" && (
                    <textarea
                      rows={2}
                      maxLength={reasonsLive ? REASON_MAX : undefined}
                      aria-label={reasonsLive ? t("messageLabel") : undefined}
                      placeholder={reasonsLive ? t("messageLabel") : t("notePlaceholder")}
                      value={notes[b.id] ?? ""}
                      onChange={e => setNotes(prev => ({ ...prev, [b.id]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                    />
                  )}
                  {b.status === "proposal" && b.scheduled_by === "patient" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActing(`accept:${b.id}`); startTransition(async () => {
                          const result = await acceptRescheduleRequest(b.id);
                          if (result.error === "slot_taken") {
                            alert(t("slotTakenAlert"));
                          } else if (result.error === "proposed_time_expired") {
                            alert(t("pastProposalAlert"));
                          } else if (result.error === "patient_archived") {
                            alert(t("patientArchivedError"));
                          }
                        }); }}
                        disabled={isPending}
                        data-testid="reschedule-accept-button"
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {spin(`accept:${b.id}`)}{t("accept")}
                      </button>
                      <button
                        onClick={() => { setActing(`decline:${b.id}`); startTransition(async () => { await declineRescheduleRequest(b.id); }); }}
                        disabled={isPending}
                        data-testid="reschedule-decline-button"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {spin(`decline:${b.id}`)}{t("decline")}
                      </button>
                    </div>
                  )}
                    </>
                  )}
                </div>
              </div>

              {/* Patient info panel */}
              {infoId === b.id && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-2">
                  {loadingProfile === b.id ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-teal-500" />
                      {t("loadingProfile")}
                    </div>
                  ) : (() => {
                    const prof = profiles[b.id];
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoName")}</span><br />{prof?.full_name || b.patient_name}</p>
                          {prof?.email && <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoEmail")}</span><br />{prof.email}</p>}
                          {prof?.phone && <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoPhone")}</span><br />{prof.phone}</p>}
                          {prof?.birth_date && <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoDob")}</span><br />{formatShortDate(locale, prof.birth_date)}</p>}
                          {idFields.map((f) => prof?.[f.name] ? (
                            <p key={f.name}><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{f.label}</span><br />{prof[f.name]}</p>
                          ) : null)}
                          {!prof && <p className="col-span-2 text-xs text-slate-400 italic">{t("infoNoProfile")}</p>}
                        </div>
                        <div className="border-t border-slate-200 pt-2">
                          <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoConsultation")}</span><br />{b.consultation_type} · {formatDateLabel(locale, b.date)} {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}</p>
                          {b.notes && <p className="mt-1 text-slate-400 italic text-xs">{b.notes}</p>}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                          <p className="text-xs">
                            {b.is_new_patient ? (
                              <span className="text-violet-600 font-semibold">{t("notInList")}</span>
                            ) : (
                              <span className="text-teal-600 font-semibold">{t("existingPatient")}</span>
                            )}
                          </p>
                          {!b.is_new_patient && b.patient_id && (
                            <Link
                              href={`${prefix}/dashboard/patients/${b.patient_id}`}
                              className="rounded-lg bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                            >
                              {t("viewProfile")}
                            </Link>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Propose-new-time form */}
              {proposalId === b.id && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-amber-800">{t("proposeFormTitle")}</p>
                  <div className="flex flex-wrap gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">{t("proposeDate")}</label>
                      <DateInput
                        value={propDate}
                        onChange={setPropDate}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">{t("proposeStart")}</label>
                      <input
                        type="time"
                        value={propStart}
                        onChange={e => setPropStart(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">{t("proposeEnd")}</label>
                      <input
                        type="time"
                        value={propEnd}
                        onChange={e => setPropEnd(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => handleProposeSubmit(b.id)}
                        disabled={isPending || !propDate || !propStart || !propEnd || looksBuddhistEra(propDate)}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {t("send")}
                      </button>
                      <button
                        onClick={() => setProposalId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>
      </div>

    </>
  );
}
