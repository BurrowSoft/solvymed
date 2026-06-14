"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { confirmBooking, confirmBookingAndAddPatient, rejectBooking, proposeNewTime } from "./booking-actions";

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
  is_new_patient?: boolean;
};

type PatientProfile = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
};

export function BookingRequestsPanel({ bookings }: { bookings: Booking[] }) {
  const t = useTranslations("schedule");
  const [isPending, startTransition] = useTransition();
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [propDate, setPropDate] = useState("");
  const [propStart, setPropStart] = useState("");
  const [propEnd, setPropEnd] = useState("");

  // new-patient confirmation dialog
  const [newPatientDialogId, setNewPatientDialogId] = useState<string | null>(null);
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
        .select("full_name, email, phone, birth_date, cpf")
        .eq("user_id", b.patient_auth_id)
        .maybeSingle();
      setProfiles(prev => ({ ...prev, [b.id]: data as PatientProfile | null }));
      setLoadingProfile(null);
    }
  }

  if (!bookings.length) return null;

  function handleConfirmClick(b: Booking) {
    if (b.is_new_patient) {
      setNewPatientDialogId(b.id);
    } else {
      startTransition(async () => { await confirmBooking(b.id); });
    }
  }

  function handleConfirmOnly(id: string) {
    setNewPatientDialogId(null);
    startTransition(async () => { await confirmBooking(id); });
  }

  function handleConfirmAndAdd(id: string) {
    setNewPatientDialogId(null);
    startTransition(async () => { await confirmBookingAndAddPatient(id); });
  }

  function handleReject(id: string) {
    startTransition(async () => { await rejectBooking(id); });
  }

  function handleProposeSubmit(id: string) {
    if (!propDate || !propStart || !propEnd) return;
    startTransition(async () => {
      await proposeNewTime(id, propDate, propStart, propEnd);
      setProposalId(null);
    });
  }

  const dialogBooking = newPatientDialogId ? bookings.find(b => b.id === newPatientDialogId) : null;

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
          {bookings.map(b => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                    {b.date} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                  </p>
                  <p className="text-sm text-slate-500">{b.consultation_type}</p>
                  {b.notes && (
                    <p className="mt-1 text-xs text-slate-400 italic">{b.notes}</p>
                  )}
                  {b.status === "proposal" && (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {t("waitingForResponse")}
                    </span>
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

                  {b.status === "tentative" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmClick(b)}
                        disabled={isPending}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {t("confirm")}
                      </button>
                      <button
                        onClick={() => setProposalId(proposalId === b.id ? null : b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {t("proposeNewTime")}
                      </button>
                      <button
                        onClick={() => handleReject(b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        {t("reject")}
                      </button>
                    </div>
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
                          {prof?.birth_date && <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoDob")}</span><br />{prof.birth_date}</p>}
                          {prof?.cpf && <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoCpf")}</span><br />{prof.cpf}</p>}
                          {!prof && <p className="col-span-2 text-xs text-slate-400 italic">{t("infoNoProfile")}</p>}
                        </div>
                        <div className="border-t border-slate-200 pt-2">
                          <p><span className="font-semibold text-slate-400 text-xs uppercase tracking-wide">{t("infoConsultation")}</span><br />{b.consultation_type} · {b.date} {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}</p>
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
                              href={`/dashboard/patients/${b.patient_id}`}
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
                      <input
                        type="date"
                        value={propDate}
                        onChange={e => setPropDate(e.target.value)}
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
                        disabled={isPending || !propDate || !propStart || !propEnd}
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
          ))}
        </div>
      </div>

      {/* New-patient confirmation dialog */}
      {dialogBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-violet-600">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">{t("dialogTitle")}</h3>
            </div>
            <p className="mb-5 text-sm text-slate-500">
              {t("dialogBody", { name: dialogBooking.patient_name })}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleConfirmAndAdd(dialogBooking.id)}
                disabled={isPending}
                className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {t("confirmAndAdd")}
              </button>
              <button
                onClick={() => handleConfirmOnly(dialogBooking.id)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("confirmOnly")}
              </button>
              <button
                onClick={() => setNewPatientDialogId(null)}
                className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-600"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
