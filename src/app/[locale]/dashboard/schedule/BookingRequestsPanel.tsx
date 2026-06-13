"use client";

import { useState, useTransition } from "react";
import { confirmBooking, confirmBookingAndAddPatient, rejectBooking, proposeNewTime } from "./booking-actions";

type Booking = {
  id: string;
  patient_name: string;
  patient_auth_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  consultation_type: string;
  status: string;
  notes?: string | null;
  is_new_patient?: boolean;
};

export function BookingRequestsPanel({ bookings }: { bookings: Booking[] }) {
  const [isPending, startTransition] = useTransition();
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [propDate, setPropDate] = useState("");
  const [propStart, setPropStart] = useState("");
  const [propEnd, setPropEnd] = useState("");

  // new-patient confirmation dialog
  const [newPatientDialogId, setNewPatientDialogId] = useState<string | null>(null);
  // patient info panel toggle
  const [infoId, setInfoId] = useState<string | null>(null);

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
          Booking Requests
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
                        New patient
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
                      Waiting for patient response
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {/* Patient Information toggle */}
                  <button
                    onClick={() => setInfoId(infoId === b.id ? null : b.id)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Patient Information
                  </button>

                  {b.status === "tentative" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmClick(b)}
                        disabled={isPending}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setProposalId(proposalId === b.id ? null : b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Propose new time
                      </button>
                      <button
                        onClick={() => handleReject(b.id)}
                        disabled={isPending}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Patient info panel */}
              {infoId === b.id && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                  <p><span className="font-semibold">Name:</span> {b.patient_name}</p>
                  <p><span className="font-semibold">Consultation:</span> {b.consultation_type}</p>
                  <p><span className="font-semibold">Date:</span> {b.date} at {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}</p>
                  {b.notes && <p><span className="font-semibold">Notes:</span> {b.notes}</p>}
                  <p>
                    <span className="font-semibold">Status:</span>{" "}
                    {b.is_new_patient ? (
                      <span className="text-violet-600 font-semibold">Not yet in your patient list</span>
                    ) : (
                      <span className="text-teal-600 font-semibold">Existing patient</span>
                    )}
                  </p>
                </div>
              )}

              {/* Propose-new-time form */}
              {proposalId === b.id && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-amber-800">Propose a new time</p>
                  <div className="flex flex-wrap gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={propDate}
                        onChange={e => setPropDate(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Start</label>
                      <input
                        type="time"
                        value={propStart}
                        onChange={e => setPropStart(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">End</label>
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
                        Send
                      </button>
                      <button
                        onClick={() => setProposalId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
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
              <h3 className="text-base font-bold text-slate-900">Patient not in your list</h3>
            </div>
            <p className="mb-5 text-sm text-slate-500">
              <strong>{dialogBooking.patient_name}</strong> is not yet in your patient list. Would you like to add them while confirming this appointment?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleConfirmAndAdd(dialogBooking.id)}
                disabled={isPending}
                className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Confirm and Add New Patient
              </button>
              <button
                onClick={() => handleConfirmOnly(dialogBooking.id)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Confirm only
              </button>
              <button
                onClick={() => setNewPatientDialogId(null)}
                className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
