"use client";

import { useState, useTransition } from "react";
import { confirmBooking, rejectBooking, proposeNewTime } from "./booking-actions";

type Booking = {
  id: string;
  patient_name: string;
  date: string;
  start_time: string;
  end_time: string;
  consultation_type: string;
  status: string;
  notes?: string | null;
};

export function BookingRequestsPanel({ bookings }: { bookings: Booking[] }) {
  const [isPending, startTransition] = useTransition();
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [propDate, setPropDate] = useState("");
  const [propStart, setPropStart] = useState("");
  const [propEnd, setPropEnd] = useState("");

  if (!bookings.length) return null;

  function handleConfirm(id: string) {
    startTransition(async () => { await confirmBooking(id); });
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

  return (
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
                <p className="font-semibold text-slate-900">{b.patient_name}</p>
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
              {b.status === "tentative" && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleConfirm(b.id)}
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

            {/* Inline propose-new-time form */}
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
  );
}
