"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeSlots, toMinutes } from "@/lib/slots";
import type { WorkingHours, TimeSlot } from "@/lib/slots";

type Procedure = { id: string; name: string; durationMinutes: number; price?: number; paymentType: string };

const FALLBACK_DURATIONS = [30, 45, 60];
const DAYS_AHEAD = 14;
const CONSULT_TYPES = ["Consultation", "Follow-up", "Exam Review", "Procedure", "Emergency"] as const;

function buildDays() {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
function dayLabel(dateStr: string) {
  const today = new Date().toISOString().split("T")[0];
  if (dateStr === today) return "Today";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function formatTime(t: string) {
  const [h, m] = t.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

async function fetchSlots(
  professionalId: string,
  date: string,
  durationMinutes: number,
  workingHours: WorkingHours,
): Promise<TimeSlot[]> {
  const supabase = createClient();
  const { data: busy } = await supabase.rpc("get_busy_slots", {
    p_professional_id: professionalId,
    p_date: date,
  });
  const busyRanges: Array<{ start: number; end: number }> = (busy ?? []).map(
    (row: Record<string, unknown>) => ({
      start: toMinutes(row.slot_start as string),
      end: toMinutes(row.slot_end as string),
    }),
  );
  return computeSlots(date, durationMinutes, workingHours, busyRanges);
}

export function BookingClient({
  professionalId,
  professionalName,
  specialty,
  clinicName,
  patientAuthId,
  patientEmail,
  locale,
}: {
  professionalId: string;
  professionalName: string;
  specialty: string;
  clinicName?: string;
  patientAuthId: string;
  patientEmail: string;
  locale: string;
}) {
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const days = buildDays();

  function applyConsultType(name: string) {
    if ((CONSULT_TYPES as readonly string[]).includes(name)) {
      setConsultType(name);
      setIsOther(false);
    } else {
      setConsultType(name);
      setIsOther(true);
    }
  }

  // Working hours — fetched via SECURITY DEFINER RPC (patients can't read professionals table)
  const [workingHours, setWorkingHours] = useState<WorkingHours>({});
  const [loadingHours, setLoadingHours] = useState(true);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(true);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [duration, setDuration] = useState(30);

  const [selectedDate, setSelectedDate] = useState(days[0]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [consultType, setConsultType] = useState("");
  const [isOther, setIsOther] = useState(false);
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(false);
  const [bookedSlot, setBookedSlot] = useState<TimeSlot | null>(null);
  const [bookedDate, setBookedDate] = useState("");

  // Fetch working hours (SECURITY DEFINER bypasses patient RLS)
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("get_professional_working_hours", {
          p_professional_id: professionalId,
        });
        if (data) setWorkingHours(data as WorkingHours);
      } catch {
        // stay empty — slots will show as unavailable
      } finally {
        setLoadingHours(false);
      }
    })();
  }, [professionalId]);

  // Fetch procedures
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("get_professional_procedures", {
          p_professional_id: professionalId,
        });
        const procs: Procedure[] = (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          durationMinutes: r.duration_minutes as number,
          price: r.price != null ? Number(r.price) : undefined,
          paymentType: r.payment_type as string,
        }));
        setProcedures(procs);
        if (procs.length > 0) {
          setSelectedProcedure(procs[0]);
          setDuration(procs[0].durationMinutes);
          applyConsultType(procs[0].name);
        }
      } catch {
        // ignore
      } finally {
        setLoadingProcs(false);
      }
    })();
  }, [professionalId]);

  // Load slots whenever date, duration, or working hours change
  const loadSlots = useCallback(
    async (date: string, dur: number) => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      try {
        const s = await fetchSlots(professionalId, date, dur, workingHours);
        setSlots(s);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [professionalId, workingHours],
  );

  useEffect(() => {
    if (!loadingHours) loadSlots(selectedDate, duration);
  }, [selectedDate, duration, loadSlots, loadingHours]);

  async function handleBook() {
    if (!selectedSlot) return;
    setBooking(true);
    setError("");
    const supabase = createClient();
    try {
      const { error: rpcError } = await supabase.rpc("create_public_booking", {
        p_professional_id: professionalId,
        p_patient_auth_id: patientAuthId,
        p_patient_name: patientEmail.split("@")[0],
        p_date: selectedDate,
        p_start_time: selectedSlot.start,
        p_end_time: selectedSlot.end,
        p_duration_minutes: duration,
        p_consultation_type: consultType.trim() || specialty || "Consultation",
        p_payment_type: selectedProcedure?.paymentType ?? "private",
        p_notes: notes.trim() || null,
      });
      if (rpcError) {
        const msg = rpcError.message ?? "";
        if (msg.includes("slot_taken")) {
          setError("This slot was just taken. Please choose another time.");
          loadSlots(selectedDate, duration);
        } else if (msg.includes("blocked")) {
          setError("Your bookings with this professional are currently restricted. Please contact the clinic.");
        } else if (msg.includes("Max concurrent")) {
          setError("You already have the maximum number of active appointments with this professional.");
        } else {
          setError("Could not send booking request. Please try again.");
        }
        return;
      }
      setBookedSlot(selectedSlot);
      setBookedDate(selectedDate);
      setBooked(true);
    } catch {
      setError("Could not send booking request. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  // Success screen
  if (booked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mb-2">Request sent!</h1>
          <p className="text-slate-500 text-sm mb-1">
            Your request for <strong>{dayLabel(bookedDate)}</strong> at <strong>{formatTime(bookedSlot!.start)}</strong> with <strong>{professionalName}</strong> has been submitted.
          </p>
          <p className="text-slate-400 text-xs mb-8">The doctor will confirm or suggest a different time.</p>
          <button
            onClick={() => router.push(`${prefix}/my-appointments`)}
            className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition mb-3"
          >
            View my appointments
          </button>
          <button
            onClick={() => router.push(`${prefix}/discover`)}
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Back to clinics
          </button>
        </div>
      </div>
    );
  }

  const setupLoading = loadingHours || loadingProcs;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <span className="font-bold text-slate-900">Book Appointment</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Doctor card */}
        <div className="rounded-2xl bg-teal-50 border border-teal-100 p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold text-lg">
            {professionalName.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-slate-900">{professionalName}</p>
            {specialty && <p className="text-sm text-teal-700">{specialty}</p>}
            {clinicName && <p className="text-xs text-slate-500 mt-0.5">{clinicName}</p>}
          </div>
        </div>

        {setupLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Procedure picker */}
            {procedures.length > 0 ? (
              <div>
                <h2 className="text-sm font-bold text-slate-700 mb-2">Select procedure</h2>
                <div className="space-y-2">
                  {procedures.map((proc) => {
                    const active = selectedProcedure?.id === proc.id;
                    return (
                      <button
                        key={proc.id}
                        onClick={() => { setSelectedProcedure(proc); setDuration(proc.durationMinutes); applyConsultType(proc.name); }}
                        className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${active ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <p className={`font-semibold text-sm ${active ? "text-teal-800" : "text-slate-800"}`}>{proc.name}</p>
                        <p className={`text-xs mt-0.5 ${active ? "text-teal-600" : "text-slate-400"}`}>
                          {proc.durationMinutes} min{proc.price ? ` · R$ ${proc.price.toFixed(2)}` : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-sm font-bold text-slate-700 mb-2">Session duration</h2>
                <div className="flex gap-2">
                  {FALLBACK_DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setSelectedProcedure(null); setDuration(d); }}
                      className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition ${duration === d ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Consultation type */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">
                What is this appointment for? <span className="font-normal text-red-400">*</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {CONSULT_TYPES.map((type) => {
                  const active = !isOther && consultType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setConsultType(type); setIsOther(false); }}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${active ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {type}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setIsOther(true); setConsultType(""); }}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${isOther ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  Other
                </button>
              </div>
              {isOther && (
                <input
                  type="text"
                  value={consultType}
                  onChange={(e) => setConsultType(e.target.value)}
                  placeholder="Describe the appointment…"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  autoFocus
                />
              )}
            </div>

            {/* Date strip */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">Pick a date</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={`shrink-0 rounded-xl border-2 px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${selectedDate === day ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {dayLabel(day)}
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">Available times</h2>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 py-8 text-center">
                  <p className="text-sm text-slate-500 font-medium">No available slots</p>
                  <p className="text-xs text-slate-400 mt-1">Try a different date.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${selectedSlot?.start === slot.start ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">Notes <span className="font-normal text-slate-400">(optional)</span></h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for visit, symptoms, questions for the doctor…"
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={!selectedSlot || !consultType.trim() || booking}
              className="w-full rounded-xl bg-teal-600 py-4 text-base font-bold text-white shadow-sm hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {booking ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending…
                </span>
              ) : "Send Booking Request"}
            </button>

            <p className="text-center text-xs text-slate-400 pb-8">
              The doctor will confirm or suggest a different time. You'll be notified either way.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
