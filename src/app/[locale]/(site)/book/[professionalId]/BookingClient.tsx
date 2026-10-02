"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { computeSlots, toMinutes, filterPastSlots, getDayHours } from "@/lib/slots";
import { addDays, clinicDate, clinicTime } from "@/lib/clinicTime";
import { formatMoney } from "@/lib/money";
import { profileOfKind, profileOfPhonePrefix, type Currency } from "@/lib/country";
import { isValidThaiId, type PatientIdKind } from "@/lib/patientIds";
import { usePatientIdFields, type PatientIdValues } from "@/lib/usePatientIdFields";
import { dateLocale, formatTimeLabel } from "@/lib/dateLabels";
import { birthDateOutOfRange, looksBuddhistEra } from "@/lib/buddhistEra";
import { DateInput } from "@/components/DateInput";
import { notifyProfessionalOfBooking } from "./notify-action";
import type { WorkingHours, TimeSlot } from "@/lib/slots";
import { MonthCalendar } from "@/components/MonthCalendar";
import { chosenTimeParts } from "@/lib/chosenTime";
import { BrandMarkTile } from "@/components/BrandLogo";
import { PLAIN_CONSULTATION } from "@/lib/consultType";

type Procedure = { id: string; name: string; durationMinutes: number; price?: number; paymentType: string };


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

// The dial code the phone starts at: the booked practice's country (UX);
// for a practice outside the named countries, a guess from the UI language.
function getDefaultCountry(locale: string, idKind: PatientIdKind) {
  const prefix = profileOfKind(idKind).phonePrefix;
  const practice = prefix ? COUNTRIES.find((c) => c.dialCode === prefix) : undefined;
  if (practice) return practice;
  const code = LOCALE_TO_COUNTRY[locale] ?? "US";
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[2];
}

function getDateFormat(locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(dateLocale(locale), { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2000, 0, 31));
    return parts.map((p) => {
      if (p.type === "year") return "YYYY";
      if (p.type === "month") return "MM";
      if (p.type === "day") return "DD";
      return p.value;
    }).join("");
  } catch { return "YYYY-MM-DD"; }
}
// Days a patient can book ahead (items 7/10: the same range as the app).
const DAYS_AHEAD = 30;
// A load that takes longer than this shows "couldn't load" + Retry.
const LOAD_TIMEOUT_MS = 15_000;
function withTimeout<T>(p: PromiseLike<T>, ms: number = LOAD_TIMEOUT_MS): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// The fixed choices are stored as the app's keys (6.2); the practice's
// default length is 30 minutes until a per-practice setting exists.
const FOLLOW_UP = "Follow-up";
const DEFAULT_MINUTES = 30;

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// The next DAYS_AHEAD days on the CLINIC's calendar (its country's zone;
// a patient can't read the practice row), today included (item 10).
function buildDays(tz: string) {
  const today = clinicDate(new Date(), tz);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
}
function dayLabel(dateStr: string, locale: string, todayLabel: string, today: string) {
  if (dateStr === today) return todayLabel;
  return new Date(dateStr + "T12:00:00").toLocaleDateString(dateLocale(locale), {
    weekday: "short", month: "short", day: "numeric",
  });
}
const formatTime = formatTimeLabel;


async function fetchSlots(
  professionalId: string,
  date: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  tz: string,
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
  const slots = computeSlots(date, durationMinutes, workingHours, busyRanges);
  // Today's times already past on the clinic's clock are left out.
  const now = new Date();
  return filterPastSlots(slots, date, toMinutes(clinicTime(now, tz)), clinicDate(now, tz));
}

export function BookingClient({
  professionalId,
  professionalName,
  specialty,
  clinicName,
  patientAuthId,
  patientEmail,
  locale,
  initialManualProfile,
  currency = "BRL",
  idKind = "BR",
  clinicTz: clinicTzProp,
}: {
  professionalId: string;
  professionalName: string;
  specialty: string;
  clinicName?: string;
  patientAuthId: string;
  patientEmail: string;
  locale: string;
  initialManualProfile?: { full_name: string | null; phone: string | null; birth_date: string | null; cpf: string | null; th_national_id?: string | null; passport_number?: string | null } | null;
  // The practice's currency (its country), for procedure prices.
  currency?: Currency;
  // The practice country's patient identifier (lib/patientIds).
  idKind?: PatientIdKind;
  clinicTz?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("book");
  const tEx = useTranslations("countryExamples");
  const tIds = useTranslations("patientIds");
  const tDate = useTranslations("dateInput");
  const tConsult = useTranslations("consultType");
  const prefix = locale === "en" ? "" : `/${locale}`;
  // The next DAYS_AHEAD days in the visitor's calendar, built after mount:
  // during the server render "today" is the server's (UTC) date, a day
  // ahead of Brazil from 21:00, which shifted the strip and failed
  // hydration (React #418).
  const [days, setDays] = useState<string[]>([]);
  // The clinic's zone: its own (get_professional_public_info time_zone,
  // from the page), else its country's.
  const clinicTz = clinicTzProp || profileOfKind(idKind).defaultTimeZone;


  // Working hours — fetched via SECURITY DEFINER RPC (patients can't read professionals table)
  const [workingHours, setWorkingHours] = useState<WorkingHours>({});
  const [loadingHours, setLoadingHours] = useState(true);
  // A slow or failed load: a message + Retry (bumps reloadKey) instead of
  // an endless spinner or an empty list.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(true);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [duration, setDuration] = useState(30);

  const [selectedDate, setSelectedDate] = useState("");
  useEffect(() => {
    const d = buildDays(clinicTz);
    setDays(d);
    setSelectedDate(d[0]);
  }, []);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  // The date the shown slots were loaded for (null = none yet).
  const [slotsFor, setSlotsFor] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customTimeValue, setCustomTimeValue] = useState("");

  const [consultType, setConsultType] = useState<string>(PLAIN_CONSULTATION);
  const [isOther, setIsOther] = useState(false);
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(false);
  const [bookedSlot, setBookedSlot] = useState<TimeSlot | null>(null);
  const [bookedDate, setBookedDate] = useState("");

  // Patient profile — pre-loaded from patient_profiles, editable before booking
  const [patientFullName, setPatientFullName] = useState(patientEmail.split("@")[0]);
  const [phoneCountry, setPhoneCountry] = useState(() => getDefaultCountry(locale, idKind));
  const [patientPhoneLocal, setPatientPhoneLocal] = useState("");
  const [patientDob, setPatientDob] = useState("");
  // The identifier(s) the booked practice's country uses (CPF / Thai ID +
  // passport / passport). Only those columns are read and written, so a
  // Brazilian practice (all of them before migration 110) works as before.
  const [patientIds, setPatientIds] = useState<PatientIdValues>({});
  const idFields = usePatientIdFields(idKind, patientIds);
  const idColumns = idFields.map((f) => f.name);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load existing profile to pre-fill the form
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("patient_profiles")
          .select(["full_name", "email", "phone", "birth_date", ...idColumns].join(", "))
          .eq("user_id", patientAuthId)
          .maybeSingle<Record<string, string | null>>();
        const pickIds = (row: Record<string, unknown>) =>
          Object.fromEntries(idColumns.map((c) => [c, typeof row[c] === "string" ? (row[c] as string) : ""])) as PatientIdValues;

        const applyPhone = (stored: string) => {
          const matched = COUNTRIES.find((c) => stored.startsWith(c.dialCode));
          if (matched) {
            setPhoneCountry(matched);
            setPatientPhoneLocal(stored.slice(matched.dialCode.length));
          } else {
            setPatientPhoneLocal(stored);
          }
        };

        if (data?.full_name || data?.phone) {
          if (data.full_name) setPatientFullName(data.full_name as string);
          if (data.phone) applyPhone(data.phone as string);
          if (data.birth_date) setPatientDob(data.birth_date as string);
          setPatientIds(pickIds(data));
        } else if (initialManualProfile) {
          // Patient was manually added as a walk-in before signing up — use that data
          if (initialManualProfile.full_name) setPatientFullName(initialManualProfile.full_name);
          if (initialManualProfile.phone) applyPhone(initialManualProfile.phone);
          if (initialManualProfile.birth_date) setPatientDob(initialManualProfile.birth_date);
          setPatientIds(pickIds(initialManualProfile));
        }
      } catch { /* non-fatal */ }
      setProfileLoaded(true);
    })();
    // idColumns follows idKind, a prop that doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientAuthId, initialManualProfile]);

  // Fetch working hours (SECURITY DEFINER bypasses patient RLS)
  useEffect(() => {
    setLoadingHours(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await withTimeout(supabase.rpc("get_professional_working_hours", {
          p_professional_id: professionalId,
        }));
        if (error) throw error;
        setWorkingHours((data ?? {}) as WorkingHours);
      } catch {
        setLoadError(true);
      } finally {
        setLoadingHours(false);
      }
    })();
  }, [professionalId, reloadKey]);

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
        // The plain Consulta stays the default; a procedure is picked on
        // purpose (its length and price), as the doctor's form (6.2).
        setProcedures(procs.filter((pr) => pr.name !== PLAIN_CONSULTATION && pr.name !== FOLLOW_UP));
      } catch {
        // ignore
      } finally {
        setLoadingProcs(false);
      }
    })();
  }, [professionalId]);

  // Load slots whenever date, duration, or working hours change. Only the
  // LATEST request may set them: a slow answer for a day the patient has
  // already left would otherwise overwrite the new day's grid (3e).
  const slotsSeq = useRef(0);
  const loadSlots = useCallback(
    async (date: string, dur: number) => {
      const seq = ++slotsSeq.current;
      setLoadingSlots(true);
      setSelectedSlot(null);
      try {
        const s = await withTimeout(fetchSlots(professionalId, date, dur, workingHours, clinicTz));
        if (seq !== slotsSeq.current) return;
        setSlots(s);
        setSlotsFor(date);
      } catch {
        if (seq !== slotsSeq.current) return;
        setSlots([]);
        setLoadError(true);
      } finally {
        if (seq === slotsSeq.current) setLoadingSlots(false);
      }
    },
    [professionalId, workingHours, clinicTz],
  );

  useEffect(() => {
    if (!loadingHours && !loadError && selectedDate) loadSlots(selectedDate, duration);
  }, [selectedDate, duration, loadSlots, loadingHours, loadError, reloadKey]);

  // Days the clinic opens (its working hours); a closed day is greyed in the
  // calendar, and the first open day is picked.
  const openDay = useCallback((d: string) => !!getDayHours(d, workingHours)?.enabled, [workingHours]);
  const anyOpen = days.some(openDay);
  useEffect(() => {
    if (loadingHours || !selectedDate || openDay(selectedDate)) return;
    const first = days.find(openDay);
    if (first) setSelectedDate(first);
  }, [loadingHours, selectedDate, days, openDay]);
  const retry = () => { setLoadError(false); setReloadKey((k) => k + 1); };
  // The range starts today only while today still has a time left (e7).
  const skippedToday = useRef(false);
  useEffect(() => {
    if (skippedToday.current || loadingSlots || loadingHours || loadError || !days.length) return;
    // Only once today's own slots have loaded (not the empty initial list).
    if (selectedDate === days[0] && slotsFor === days[0] && slots.length === 0) {
      skippedToday.current = true;
      const next = days.slice(1).find(openDay);
      if (next) setSelectedDate(next);
    }
  }, [loadingSlots, loadingHours, loadError, days, selectedDate, slots.length, slotsFor, openDay]);

  async function handleBook() {
    if (!selectedSlot) return;
    // A Thai ID must pass its checksum (the database refuses it otherwise).
    const thaiId = profileOfKind(idKind).idFields.find((f) => f.checksum === "thai");
    const thaiValue = thaiId ? patientIds[thaiId.name]?.trim() : "";
    if (thaiValue && !isValidThaiId(thaiValue)) {
      setError(tIds("thaiIdInvalid"));
      return;
    }
    // A Buddhist-era birth year is never saved (the field says why).
    if (looksBuddhistEra(patientDob) || birthDateOutOfRange(patientDob)) return;
    setBooking(true);
    setError("");
    const supabase = createClient();
    try {
      // Persist patient profile before creating the booking
      const fullPhone = patientPhoneLocal.trim()
        ? `${phoneCountry.dialCode}${patientPhoneLocal.trim()}`
        : null;
      const { error: profileError } = await supabase.from("patient_profiles").upsert(
        {
          user_id: patientAuthId,
          full_name: patientFullName.trim(),
          email: patientEmail,
          phone: fullPhone,
          birth_date: patientDob || null,
          // Only the booked practice country's identifier columns.
          ...Object.fromEntries(idColumns.map((c) => [c, patientIds[c]?.trim() || null])),
        },
        { onConflict: "user_id" },
      );
      // The database refuses a birth date outside 1900..today (116): say so
      // and don't book with a profile that wasn't saved.
      if (profileError?.message?.includes("invalid_birth_date")) { setError(tDate("invalidBirthDate")); return; }

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
        if (msg.includes("practice_inactive")) {
          // The practice's subscription is locked (migration 142).
          setError(t("practiceInactive"));
        } else if (msg.includes("patient_archived")) {
          // The clinic archived this patient's record there.
          setError(t("errorArchived"));
        } else if (msg.includes("slot_taken")) {
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mb-2">{t("successTitle")}</h1>
          <p className="text-slate-500 text-sm mb-1">
            {t("successBody", { date: dayLabel(bookedDate, locale, t("today"), days[0] ?? ""), time: formatTime(locale, bookedSlot!.start), doctor: professionalName })}
          </p>
          <p className="text-slate-400 text-xs mb-8">{t("successHint")}</p>
          <button
            onClick={() => router.push(`${prefix}/my-appointments`)}
            className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition"
          >
            {t("viewAppointments")}
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
            <BrandMarkTile size="sm" decorative />
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
            {/* What the visit is for (Vitor, build 25: patients shouldn't have
                to type it; e7's final list, same as the app): Consulta and
                Retorno always, then the clinic's procedures with their length
                and price, then Outro + a short text only when the clinic has
                procedures. Patients never pick a length: Consulta/Retorno/
                Outro use the practice's default, a procedure its own. */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">
                {t("appointmentFor")} <span className="font-normal text-red-400">*</span>
              </h2>
              <div className="space-y-2" role="radiogroup" aria-label={t("appointmentFor")} data-testid="type-list">
                {[
                  ...[PLAIN_CONSULTATION, FOLLOW_UP].map((key) => ({
                    key, label: tConsult(key === FOLLOW_UP ? "followUp" : "consultation"), sub: t("durationMin", { n: DEFAULT_MINUTES }),
                    active: !isOther && !selectedProcedure && consultType === key,
                    pick: () => { setSelectedProcedure(null); setDuration(DEFAULT_MINUTES); setConsultType(key); setIsOther(false); },
                  })),
                  ...procedures.map((proc) => ({
                    key: proc.id, label: proc.name,
                    sub: `${t("durationMin", { n: proc.durationMinutes })}${proc.price ? ` · ${formatMoney(proc.price, currency)}` : ""}`,
                    active: !isOther && selectedProcedure?.id === proc.id,
                    pick: () => { setSelectedProcedure(proc); setDuration(proc.durationMinutes); setConsultType(proc.name); setIsOther(false); },
                  })),
                  ...(procedures.length > 0 ? [{ key: "other", label: t("other"), sub: "", active: isOther,
                    pick: () => { setSelectedProcedure(null); setDuration(DEFAULT_MINUTES); setConsultType(""); setIsOther(true); } }] : []),
                ].map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={o.active}
                    onClick={o.pick}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${o.active ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  >
                    <p className={`font-semibold text-sm ${o.active ? "text-teal-800" : "text-slate-800"}`}>{o.label}</p>
                    {o.sub && <p className={`text-xs mt-0.5 ${o.active ? "text-teal-600" : "text-slate-400"}`}>{o.sub}</p>}
                  </button>
                ))}
              </div>
              {isOther && (
                <input
                  type="text"
                  value={consultType}
                  onChange={(e) => setConsultType(e.target.value)}
                  placeholder={t("otherHint")}
                  aria-label={t("other")}
                  maxLength={80}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  autoFocus
                />
              )}
            </div>

            {/* Couldn't load (15 s or an error): say so, with Retry. */}
            {loadError && (
              <div data-testid="load-failed" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
                <p className="text-sm font-medium text-amber-800">{t("loadFailed")}</p>
                <button type="button" onClick={retry} className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">{t("retry")}</button>
              </div>
            )}

            {/* No working hours at all: the clinic hasn't opened online booking. */}
            {!loadError && !loadingHours && days.length > 0 && !anyOpen && (
              <div data-testid="no-hours" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-600">{t("noHours")}</p>
              </div>
            )}

            {!loadError && (loadingHours || anyOpen) && (<>
            {/* Month calendar (item 7) */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">{t("pickDate")}</h2>
              {days.length > 0 && (
                <MonthCalendar
                  days={days}
                  selected={selectedDate || null}
                  onSelect={setSelectedDate}
                  isOpen={(d) => loadingHours || openDay(d)}
                  locale={locale}
                  labels={{ prev: t("prevMonth"), next: t("nextMonth") }}
                />
              )}
            </div>

            {/* Time slots: a grid; a skeleton while loading (items 5/16/17). */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-2">{t("availableTimes")}</h2>
              {loadingSlots || loadingHours || !selectedDate ? (
                <div data-testid="slots-skeleton" className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-busy="true">
                  {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 py-8 text-center">
                  {/* Today with nothing left says so (e7), not the general text. */}
                  <p className="text-sm text-slate-500 font-medium">{selectedDate === days[0] ? t("noTimesToday") : t("noSlots")}</p>
                  <p className="text-xs text-slate-400 mt-1">{t("tryDifferentDate")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      aria-pressed={selectedSlot?.start === slot.start && !showCustomTime}
                      onClick={() => { setSelectedSlot(slot); setShowCustomTime(false); setCustomTimeValue(""); }}
                      className={`w-full rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${selectedSlot?.start === slot.start && !showCustomTime ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {formatTime(locale, slot.start)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            </>)}

            {/* Custom time */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setShowCustomTime(v => !v);
                  if (showCustomTime) {
                    setCustomTimeValue("");
                    setSelectedSlot(null);
                  }
                }}
                className={`flex items-center gap-1.5 text-sm font-semibold transition ${showCustomTime && customTimeValue ? "text-teal-800 underline underline-offset-2" : "text-teal-600 hover:text-teal-700"}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                {showCustomTime && customTimeValue ? `${t("orCustomTime")}: ${customTimeValue} → ${addMins(customTimeValue, duration)}` : t("orCustomTime")}
              </button>
              {showCustomTime && (
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="time"
                    value={customTimeValue}
                    onChange={e => {
                      const val = e.target.value;
                      setCustomTimeValue(val);
                      if (val) {
                        setSelectedSlot({ start: val, end: addMins(val, duration) });
                      } else {
                        setSelectedSlot(null);
                      }
                    }}
                    className="rounded-xl border-2 border-teal-500 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                  {customTimeValue && (
                    <span className="text-xs text-slate-400">
                      {customTimeValue} → {addMins(customTimeValue, duration)}
                    </span>
                  )}
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
                    placeholder={profileOfPhonePrefix(phoneCountry.dialCode).examples.mobile?.national ?? tEx("phone")}
                    className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t("dobLabel")} <span className="text-red-400">*</span></label>
                <DateInput birthDate
                  value={patientDob}
                  onChange={setPatientDob}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">{getDateFormat(locale)}</p>
              </div>
              {idFields.map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label} <span className="text-slate-400 font-normal">{t("notesOptional")}</span></label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => setPatientIds((ids) => ({ ...ids, [f.name]: e.target.value }))}
                    placeholder={f.name === "cpf" ? t("cpfPlaceholder") : f.placeholder}
                    inputMode={f.inputMode}
                    maxLength={f.maxLength}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              ))}
            </div>

            {/* The chosen time, always visible above the button (item 10). */}
            {selectedSlot && selectedDate && (
              <p data-testid="chosen-time" className="rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
                {t("chosenTime", chosenTimeParts(selectedDate, selectedSlot.start, selectedSlot.end, profileOfKind(idKind)))}
              </p>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={!selectedSlot || !consultType.trim() || !patientFullName.trim() || !patientPhoneLocal.trim() || !patientDob || looksBuddhistEra(patientDob) || birthDateOutOfRange(patientDob) || booking}
              className="w-full rounded-xl bg-teal-600 py-4 text-base font-bold text-white shadow-sm hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {booking ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner-white" />
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
