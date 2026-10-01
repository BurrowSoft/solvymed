import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ScheduleNav, NewAppointmentButton, BlockTimeButton, AppointmentStatusSelect, DeleteAppointmentButton, RescheduleButton, ViewToggle, PixQrButton, PromptPayQrButton, ScheduleUndoToast } from "./ScheduleClient";
import { MOVABLE_STATUSES, offersPaymentQr } from "@/lib/scheduleChecks";
import { hasAmount } from "@/lib/paymentRules";
import { SetAmountButton } from "../payments/PaymentsClient";
import { normalizePromptPayId } from "@/lib/promptpay";
import { BookingRequestsPanel } from "./BookingRequestsPanel";
import { getTentativeBookings } from "./booking-actions";
import { CalendarView, type CalendarAppt } from "./CalendarView";
import { ShareInviteLinkButton } from "@/components/ShareInviteLinkButton";
import { clinicDate, getClinicTimeZone } from "@/lib/clinicTime";
import { formatMoney } from "@/lib/money";
import { countryProfile } from "@/lib/country";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { statusReasonLive } from "@/lib/statusReason";
import { AutoRefresh } from "@/components/AutoRefresh";

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function addDaysTo(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function getWeekStart(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoDate(d);
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-700";
    case "scheduled": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    case "blocked": return "bg-slate-100 text-slate-500";
    case "late": return "bg-orange-100 text-orange-700";
    case "absent": return "bg-red-100 text-red-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; view?: string; new?: string }>;
}) {
  const { locale } = await params;
  const { date: dateParam, view: viewParam, new: newParam } = await searchParams;

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
  const effectiveProfId = isSecretary
    ? (userRoleData?.invited_by_professional_id as string | null) ?? user.id
    : user.id;

  // Amounts are in the practice's currency (its country), not the UI's.
  const practiceCountry = await getPracticeCountry(supabase, user.id, effectiveProfId);
  const { currency } = countryProfile(practiceCountry);

  // The practice's today, not the server's (UTC).
  const timeZone = await getClinicTimeZone(supabase, { professionalId: effectiveProfId, isSecretary });
  const today = clinicDate(new Date(), timeZone);
  const currentDate = dateParam ?? today;
  const view = (["list", "day", "week", "month"].includes(viewParam ?? "")) ? (viewParam as "list" | "day" | "week" | "month") : "list";

  // Compute date range to fetch
  let rangeStart = currentDate;
  let rangeEnd = currentDate;
  if (view === "week") {
    rangeStart = getWeekStart(currentDate);
    rangeEnd = addDaysTo(rangeStart, 6);
  } else if (view === "month") {
    const d = new Date(currentDate + "T12:00:00");
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    const fdow = firstDay.getDay();
    firstDay.setDate(firstDay.getDate() - (fdow === 0 ? 6 : fdow - 1));
    rangeStart = isoDate(firstDay);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const ldow = lastDay.getDay();
    lastDay.setDate(lastDay.getDate() + (ldow === 0 ? 0 : 7 - ldow));
    rangeEnd = isoDate(lastDay);
  }

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
              {appointments.map((appt) => (
                <div
                  key={appt.id} data-highlight-id={appt.id}
                  className={`group flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                    appt.status === "blocked" ? "border-slate-100 opacity-75" : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <div className="shrink-0 text-right min-w-[52px]">
                    <p className="text-sm font-bold text-slate-900">{appt.start_time?.slice(0, 5)}</p>
                    <p className="text-xs text-slate-400">{appt.end_time?.slice(0, 5)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{appt.duration_minutes}m</p>
                  </div>
                  <div className={`mt-1 h-full w-0.5 self-stretch rounded-full min-h-10 ${appt.status === "blocked" ? "bg-slate-200" : "bg-teal-200"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{appt.patient_name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {appt.consultation_type}
                          {appt.type === "online" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-semibold">{t("onlineBadge")}</span>}
                        </p>
                        {appt.patient_note && <p className="text-xs text-slate-500 mt-1 truncate"><span className="font-semibold">{t("patientMessage")}:</span> {appt.patient_note}</p>}
                        {appt.notes && <p className="text-xs text-slate-400 mt-1 truncate">{appt.notes}</p>}
                        {(appt as { status_reason?: string | null }).status_reason && (
                          <p className="text-xs text-slate-500 mt-1 truncate"><span className="font-semibold">{t("reasonShort")}:</span> {(appt as { status_reason?: string | null }).status_reason}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {appt.status !== "blocked" && <AppointmentStatusSelect id={appt.id} current={appt.status} />}
                        {appt.status === "blocked" && (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge(appt.status)}`}>{t("blockedLabel")}</span>
                        )}
                        {pixKey && offersPaymentQr(appt) && (
                          <PixQrButton
                            pixKey={pixKey}
                            clinicName={clinicName}
                            clinicCity={clinicCity}
                            amount={appt.payment_amount}
                          />
                        )}
                        {promptPayId && offersPaymentQr(appt) && (
                          <PromptPayQrButton promptPayId={promptPayId} amount={appt.payment_amount} />
                        )}
                        {MOVABLE_STATUSES.includes(appt.status) && <RescheduleButton id={appt.id} date={appt.date} start={appt.start_time} />}
                        {/* A no-show is never moved (UX 36): book again instead. */}
                        {appt.status === "absent" && (
                          <NewAppointmentButton defaultDate={today} currency={currency} procedures={procedures}
                            prefill={{ patientId: appt.patient_id ?? null, patientName: appt.patient_name, procedureName: appt.consultation_type, duration: appt.duration_minutes }} />
                        )}
                        <DeleteAppointmentButton id={appt.id} />
                      </div>
                    </div>
                    {appt.status !== "blocked" && (
                      <div className="mt-2 flex items-center gap-3">
                        {appt.payment_status !== "paid" && !hasAmount(appt.payment_amount) ? (
                          // No amount yet (the app's #216): not to-receive; set one here,
                          // prefilled with the same-named procedure's price.
                          <>
                            <SetAmountButton
                              id={appt.id}
                              currency={currency}
                              suggested={procedures.find((p) => p.name === appt.consultation_type && hasAmount(p.price))?.price ?? null}
                            />
                            {/* No QR without a value (e7): say why it's missing. */}
                            {(pixKey || promptPayId) && <span className="text-xs text-slate-400">{t("qrNeedsAmount")}</span>}
                          </>
                        ) : (
                          <span className={`text-xs font-semibold ${appt.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                            {appt.payment_status === "paid" ? t("paidLabel") : t("pendingLabel")}
                            {appt.payment_amount ? ` · ${formatMoney(appt.payment_amount, currency)}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
