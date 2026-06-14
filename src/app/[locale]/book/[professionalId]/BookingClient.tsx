"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { computeSlots, toMinutes } from "@/lib/slots";
import { notifyProfessionalOfBooking } from "./notify-action";
import type { WorkingHours, TimeSlot } from "@/lib/slots";

type Procedure = { id: string; name: string; durationMinutes: number; price?: number; paymentType: string };

const FALLBACK_DURATIONS = [30, 45, 60];

const COUNTRIES = [
  { code: "TH", flag: "🇹🇭", dialCode: "+66" },
  { code: "BR", flag: "🇧🇷", dialCode: "+55" },
  { code: "US", flag: "🇺🇸", dialCode: "+1" },
  { code: "GB", flag: "🇬🇧", dialCode: "+44" },
  { code: "CN", flag: "🇨🇳", dialCode: "+86" },
  { code: "TW", flag: "🇹🇼", dialCode: "+886" },
  { code: "JP", flag: "🇯🇵", dialCode: "+81" },
  { code: "KR", flag: "🇰🇷", dialCode: "+82" },
  { code: "SG", flag: "🇸🇬", dialCode: "+65" },
  { code: "ID", flag: "🇮🇩", dialCode: "+62" },
  { code: "VN", flag: "🇻🇳", dialCode: "+84" },
  { code: "IN", flag: "🇮🇳", dialCode: "+91" },
  { code: "AU", flag: "🇦🇺", dialCode: "+61" },
  { code: "DE", flag: "🇩🇪", dialCode: "+49" },
  { code: "FR", flag: "🇫🇷", dialCode: "+33" },
  { code: "ES", flag: "🇪🇸", dialCode: "+34" },
  { code: "MX", flag: "🇲🇽", dialCode: "+52" },
  { code: "AR", flag: "🇦🇷", dialCode: "+54" },
  { code: "PT", flag: "🇵🇹", dialCode: "+351" },
  { code: "IT", flag: "🇮🇹", dialCode: "+39" },
  { code: "RU", flag: "🇷🇺", dialCode: "+7" },
  { code: "SA", flag: "🇸🇦", dialCode: "+966" },
  { code: "CA", flag: "🇨🇦", dialCode: "+1" },
  { code: "NL", flag: "🇳🇱", dialCode: "+31" },
  { code: "PL", flag: "🇵🇱", dialCode: "+48" },
];

const LOCALE_TO_COUNTRY: Record<string, string> = {
  th: "TH", "pt-BR": "BR", en: "US", zh: "CN", "zh-TW": "TW",
  es: "ES", fr: "FR", de: "DE", it: "IT", ja: "JP",
  ko: "KR", ar: "SA", ru: "RU", id: "ID", vi: "VN",
};

function getDefaultCountry(locale: string) {
  const code = LOCALE_TO_COUNTRY[locale] ?? "US";
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[2];
}

function getDateFormat(locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2000, 0, 31));
    return parts.map((p) => {
      if (p.type === "year") return "YYYY";
      if (p.type === "month") return "MM";
      if (p.type === "day") return "DD";
      return p.value;
    }).join("");
  } catch { return "YYYY-MM-DD"; }
}
const DAYS_AHEAD = 14;
const CONSULT_TYPES = ["Consultation", "Follow-up", "Exam Review", "Procedure", "Emergency"] as const;

function buildDays() {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
function dayLabel(dateStr: string, locale: string, todayLabel: string) {
  const today = new Date().toISOString().split("T")[0];
  if (dateStr === today) return todayLabel;
  return new Date(dateStr + "T12:00:00").toLocaleDateString(locale, {
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
  const t = useTranslations("book");
  const tConsult = useTranslations("consultType");
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

  // Patient profile — pre-loaded from patient_profiles, editable before booking
  const [patientFullName, setPatientFullName] = useState(patientEmail.split("@")[0]);
  const [phoneCountry, setPhoneCountry] = useState(() => getDefaultCountry(locale));
  const [patientPhoneLocal, setPatientPhoneLocal] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [patientCpf, setPatientCpf] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load existing profile to pre-fill the form
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("patient_profiles")
          .select("full_name, email, phone, birth_date, cpf")
          .eq("user_id", patientAuthId)
          .maybeSingle();
        if (data) {
          if (data.full_name) setPatientFullName(data.full_name as string);
          if (data.phone) {
            const stored = data.phone as string;
            const matched = COUNTRIES.find((c) => stored.startsWith(c.dialCode));
            if (matched) {
              setPhoneCountry(matched);
              setPatientPhoneLocal(stored.slice(matched.dialCode.length));
            } else {
              setPatientPhoneLocal(stored);
            }
          }
          if (data.birth_date) setPatientDob(data.birth_date as string);
          if (data.cpf)        setPatientCpf(data.cpf as string);
        }
      } catch { /* non-fatal */ }
      setProfileLoaded(true);
    })();
  }, [patientAuthId]);

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
      // Persist patient profile before creating the booking
      const fullPhone = patientPhoneLocal.trim()
        ? `${phoneCountry.dialCode}${patientPhoneLocal.trim()}`
        : null;
      await supabase.from("patient_profiles").upsert(
        {
          user_id: patientAuthId,
          full_name: patientFullName.trim(),
          email: patientEmail,
          phone: fullPhone,
          birth_date: patientDob || null,
          cpf: patientCpf.trim() || null,
        },
        { onConflict: "user_id" },
      );

      const { error: rpcError } = await supabase.rpc("create_public_booking", {
        p_professional_id: professionalId,
        p_patient_auth_id: patientAuthId,
        p_patient_name: patientFullName.trim() || patientEmail.split("@")[0],
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
          setError(t("errorSlotTaken"));
          loadSlots(selectedDate, duration);
        } else if (msg.includes("blocked")) {
          setError(t("errorBlocked"));
        } else if (msg.includes("Max concurrent")) {
          setError(t("errorMaxBookings"));
        } else {
          setError(t("errorGeneric"));
        }
        return;
      }
      setBookedSlot(selectedSlot);
      setBookedDate(selectedDate);
      setBooked(true);
      notifyProfessionalOfBooking(
        professionalId,
        patientFullName.trim() || patientEmail.split("@")[0],
        selectedDate,
        selectedSlot.start,
      ).catch(() => {});
    } catch {
      setError(t("errorGeneric"));
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
          <h1 className="text-xl font-extrabold text-slate-900 mb-2">{t("successTitle")}</h1>
          <p className="text-slate-500 text-sm mb-1">
            {t("successBody", { date: dayLabel(bookedDate, locale, t("today")), time: formatTime(bookedSlot!.start), doctor: professionalName })}
          </p>
          <p className="text-slate-400 text-xs mb-8">{t("successHint")}</p>
          <button
            onClick={() => router.push(`${prefix}/my-appointments`)}
            className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition mb-3"
          >
            {t("viewAppointments")}
          </button>
          <button
            onClick={() => router.push(`${prefix}/discover`)}
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            {t("backToClinics")}
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
            <span className="font-bold text-slate-900">{t("title")}</span>
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
                <h2 className="text-sm font-bold text-slate-700 mb-2">{t("selectProcedure")}</h2>
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
                <h2 className="text-sm font-bold text-slate-700 mb-2">{t("sessionDuration")}</h2>
                <div className="flex gap-2">
                  {FALLBACK_DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setSelectedProcedure(null); setDuration(d); }}
                      className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition ${duration === d ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {t("durationMin", { n: d })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Consultation type */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">
                {t("appointmentFor")} <span className="font-normal text-red-400">*</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {CONSULT_TYPES.map((type) => {
                  const active = !isOther && consultType === type;
                  const labelKey = type === "Follow-up" ? "followUp" : type === "Exam Review" ? "examReview" : type.toLowerCase() as "consultation" | "procedure" | "emergency";
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setConsultType(type); setIsOther(false); }}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${active ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {tConsult(labelKey)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setIsOther(true); setConsultType(""); }}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${isOther ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  {t("other")}
                </button>
              </div>
              {isOther && (
                <input
                  type="text"
                  value={consultType}
                  onChange={(e) => setConsultType(e.target.value)}
                  placeholder={t("otherPlaceholder")}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  autoFocus
                />
              )}
            </div>

            {/* Date strip */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">{t("pickDate")}</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={`shrink-0 rounded-xl border-2 px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${selectedDate === day ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {dayLabel(day, locale, t("today"))}
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">{t("availableTimes")}</h2>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 py-8 text-center">
                  <p className="text-sm text-slate-500 font-medium">{t("noSlots")}</p>
                  <p className="text-xs text-slate-400 mt-1">{t("tryDifferentDate")}</p>
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
              <h2 className="text-sm font-bold text-slate-700 mb-2">{t("notes")} <span className="font-normal text-slate-400">{t("notesOptional")}</span></h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
              />
            </div>

            {/* Patient details */}
            <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-bold text-slate-700">{t("patientDetails")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{t("patientDetailsHint")}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("fullNameLabel")} <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={patientFullName}
                  onChange={e => setPatientFullName(e.target.value)}
                  placeholder={t("fullNamePlaceholder")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("emailLabel")}</label>
                <input
                  type="email"
                  value={patientEmail}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("phoneLabel")} <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <select
                    value={phoneCountry.code}
                    onChange={(e) => setPhoneCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? phoneCountry)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shrink-0"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.dialCode}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={patientPhoneLocal}
                    onChange={e => setPatientPhoneLocal(e.target.value)}
                    placeholder={t("phonePlaceholder")}
                    className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("dobLabel")} <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  value={patientDob}
                  onChange={e => setPatientDob(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">{getDateFormat(locale)}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("cpfLabel")} <span className="text-slate-400 font-normal">({t("notesOptional")})</span></label>
                <input
                  type="text"
                  value={patientCpf}
                  onChange={e => setPatientCpf(e.target.value)}
                  placeholder={t("cpfPlaceholder")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={!selectedSlot || !consultType.trim() || !patientFullName.trim() || !patientPhoneLocal.trim() || !patientDob || booking}
              className="w-full rounded-xl bg-teal-600 py-4 text-base font-bold text-white shadow-sm hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {booking ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("sending")}
                </span>
              ) : t("sendRequest")}
            </button>

            <p className="text-center text-xs text-slate-400 pb-8">{t("hint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
