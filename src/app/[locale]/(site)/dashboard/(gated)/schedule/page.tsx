import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { ScheduleNav, NewAppointmentButton, BlockTimeButton, ViewToggle, ScheduleUndoToast } from "./ScheduleClient";
import { normalizePromptPayId } from "@/lib/promptpay";
import { ScheduleRow, type RowPracticeCtx } from "./ScheduleRow";
import { AllSchedule } from "./AllSchedule";
import { ACTING_COOKIE, ALL_PRACTICES } from "@/lib/actingPractice";
import { liveFeatures } from "@/lib/liveFeatures";
import { BookingRequestsPanel } from "./BookingRequestsPanel";
import { getTentativeBookings } from "./booking-actions";
import { CalendarView, type CalendarAppt } from "./CalendarView";
import { ShareInviteLinkButton } from "@/components/ShareInviteLinkButton";
import { clinicDate, getClinicTimeZone } from "@/lib/clinicTime";
import { countryProfile } from "@/lib/country";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { statusReasonLive } from "@/lib/statusReason";
import { AutoRefresh } from "@/components/AutoRefresh";
import { actingPracticeFor, myPractices } from "@/lib/effectiveProfId";
import { parseView, viewRange } from "@/lib/calendarRange";
import { patientPhones } from "@/lib/patientPhones";
import { offersPaymentQr } from "@/lib/scheduleChecks";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; view?: string; new?: string; doctor?: string }>;
}) {
  const { locale } = await params;
  const { date: dateParam, view: viewParam, new: newParam, doctor: doctorParam } = await searchParams;

  const [supabase, t, tFirstRun] = await Promise.all([
    createClient(),
    getTranslations("schedule"),
    getTranslations("firstRun"),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isSecretary = userRoleData?.role === "secretary";
  // A secretary: the doctor chosen in the switcher (1.5.0), else her primary.
  const effectiveProfId = isSecretary
    ? (await actingPracticeFor((userRoleData?.invited_by_professional_id as string | null) ?? null, user.id)) ?? user.id
    : user.id;

  // "Todos" (166, behind the flag): every doctor she serves, in one list.
  const practices = isSecretary && liveFeatures.multiPractice ? await myPractices(user.id) : null;
  if (practices && practices.length > 1 && (await cookies()).get(ACTING_COOKIE)?.value === ALL_PRACTICES) {
    const tz = await getClinicTimeZone(supabase, { professionalId: effectiveProfId, isSecretary });
    const today0 = clinicDate(new Date(), tz);
    return <AllSchedule practices={practices} userId={user.id} today={today0} date={dateParam ?? null} doctor={doctorParam ?? null} view={parseView(viewParam)} locale={locale} />;
  }

  // Amounts are in the practice's currency (its country), not the UI's.
  const practiceCountry = await getPracticeCountry(supabase, user.id, effectiveProfId);
  const { currency } = countryProfile(practiceCountry);

  // The practice's today, not the server's (UTC).
  const timeZone = await getClinicTimeZone(supabase, { professionalId: effectiveProfId, isSecretary });
  const today = clinicDate(new Date(), timeZone);
  const currentDate = dateParam ?? today;
  const view = parseView(viewParam);
  const { start: rangeStart, end: rangeEnd } = viewRange(view, currentDate);

  // 150 (item 12): the reason a cancelled appointment shows staff.
  const apptCols: string = `id, date, patient_id, patient_name, start_time, end_time, duration_minutes, status, type, consultation_type, payment_status, payment_amount, notes, patient_note${statusReasonLive() ? ", status_reason, status_by" : ""}`;
  const [apptsResult, procsResult, tentativeBookings, profResult, anyApptResult] = await Promise.all([
    supabase
      .from("appointments")
      .select(apptCols)
      .eq("professional_id", effectiveProfId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("start_time"),
    supabase.from("procedures").select("id, name, duration_minutes, price, payment_type").eq("professional_id", effectiveProfId).eq("active", true).order("name"),
    getTentativeBookings(),
    // Pix QR details. A secretary can't read the doctor's professionals row
    // (RLS), so they come from get_my_clinic(), which returns pix_key and
    // clinic_city from migration 089. A professional reads their own row.
    isSecretary
      ? supabase.rpc("get_my_clinic")
      : supabase.from("professionals").select("pix_key, clinic_name, clinic_city, public_invite_code").eq("id", effectiveProfId).maybeSingle(),
    // Whether the practice has any appointment at all (first-run empty state).
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("professional_id", effectiveProfId).neq("status", "blocked"),
  ]);

  type PixSource = { pix_key?: string | null; clinic_name?: string | null; clinic_city?: string | null } | null;
  const pixSource = (isSecretary
    ? (Array.isArray(profResult.data) ? profResult.data[0] : null)
    : profResult.data) as PixSource;
  // Pix is Brazil's payment QR: only for a Brazilian practice (TH rule 1:
  // the practice country, never the language).
  const pixKey = countryProfile(practiceCountry).paymentQr === "pix" ? pixSource?.pix_key ?? null : null;
  // PromptPay is Thailand's: only for a Thai practice with an ID. The column
  // is from migration 110, so it's only read for Thai practices (a
  // secretary gets it from get_my_clinic, which returns it from 110).
  let promptPayId: string | null = null;
  if (countryProfile(practiceCountry).paymentQr === "promptpay") {
    const stored = isSecretary
      ? (pixSource as { promptpay_id?: string | null } | null)?.promptpay_id
      : ((await supabase.from("professionals").select("promptpay_id").eq("id", effectiveProfId).maybeSingle()).data as { promptpay_id?: string | null } | null)?.promptpay_id;
    promptPayId = normalizePromptPayId(stored);
  }
  const clinicName = pixSource?.clinic_name ?? "";
  const clinicCity = pixSource?.clinic_city ?? "";
  // The doctor's public invite code, for "Share invite link" (not for a secretary).
  const inviteCode = isSecretary ? null : ((profResult.data as { public_invite_code?: string | null } | null)?.public_invite_code ?? null);
  // No appointment ever: the first-run empty state instead of "nothing on this day".
  const noAppointmentsEver = !anyApptResult.error && (anyApptResult.count ?? 0) === 0;

  const appointments = (apptsResult.data ?? []) as unknown as CalendarAppt[];
  const procedures = (procsResult.data ?? []) as { id: string; name: string; duration_minutes: number; price?: number; payment_type: string }[];
  // G4: the list's phones, only where the Pix code can go to WhatsApp.
  const phones = view === "list" && pixKey && countryProfile(practiceCountry).paymentShare
    ? await patientPhones(supabase, appointments.filter(offersPaymentQr).map((a) => a.patient_id))
    : {};
  const rowCtx: RowPracticeCtx = { currency, pixKey, promptPayId, clinicName, clinicCity, procedures, country: practiceCountry, phones };

  const todayCount = appointments.filter(a => a.date === today && a.status !== "blocked").length;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("apptsToday", { count: todayCount })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The Agenda and its booking requests stay current (items 19/21). */}
          <AutoRefresh />
          <ViewToggle currentView={view} currentDate={currentDate} />
          <BlockTimeButton defaultDate={currentDate} />
          <NewAppointmentButton defaultDate={currentDate} currency={currency} procedures={procedures} autoOpen={newParam === "1"} />
        </div>
      </div>

      {/* Booking Requests */}
      <BookingRequestsPanel bookings={tentativeBookings as Parameters<typeof BookingRequestsPanel>[0]["bookings"]} idKind={countryProfile(practiceCountry).kind} />

      {/* ── List view (current design) ── */}
      {view === "list" && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <ScheduleNav currentDate={currentDate} currentView="list" today={today} />
          </div>
          {noAppointmentsEver ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-teal-500">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <p className="font-semibold text-slate-700">{tFirstRun("scheduleEmptyTitle")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{tFirstRun("scheduleEmptyBody")}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <NewAppointmentButton defaultDate={currentDate} currency={currency} procedures={procedures} label={tFirstRun("bookAppointment")} />
                {!isSecretary && <ShareInviteLinkButton code={inviteCode} country={practiceCountry} />}
              </div>
            </div>
          ) : appointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-slate-300">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <p className="font-semibold text-slate-500">{t("noAppts")}</p>
              <p className="text-sm text-slate-400 mt-1">{t("noApptHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => <ScheduleRow key={appt.id} appt={appt} ctx={rowCtx} today={today} />)}
            </div>
          )}
        </>
      )}

      {/* ── Calendar views ── */}
      {(view === "day" || view === "week" || view === "month") && (
        <CalendarView
          appointments={appointments}
          currentDate={currentDate}
          today={today}
          view={view}
          currency={currency}
          procedures={procedures}
        />
      )}
      <ScheduleUndoToast />
    </div>
  );
}
