import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { inRowPractice } from "@/lib/rowPractice";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { normalizePromptPayId } from "@/lib/promptpay";
import { shortDoctorName, withBrandTitle } from "@/lib/doctorName";
import { statusReasonLive } from "@/lib/statusReason";
import { clinicDate, validZone } from "@/lib/clinicTime";
import { doctorColors } from "@/lib/doctorPalette";
import { sharedZone, todosDay, viewRange, type AgendaView } from "@/lib/calendarRange";
import { patientPhones } from "@/lib/patientPhones";
import { offersPaymentQr } from "@/lib/scheduleChecks";
import { todosPractices, type MyPractice } from "@/lib/actingPractice";
import { RowPractice } from "@/components/RowPractice";
import { ItemCalendar } from "@/components/PracticeCalendar";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DoctorDot, type DoctorTagInfo } from "@/components/DoctorTag";
import { ScheduleNav, ScheduleUndoToast, ViewToggle } from "./ScheduleClient";
import { BookingRequestsPanel } from "./BookingRequestsPanel";
import { getTentativeBookings } from "./booking-actions";
import { ScheduleRow, type RowPracticeCtx } from "./ScheduleRow";
import { AllAddButtons } from "./AllAddButtons";
import { CalendarView, type CalendarAppt, type CalendarDoctors } from "./CalendarView";

type Bookings = Parameters<typeof BookingRequestsPanel>[0]["bookings"];

// One doctor's part of the "All" schedule (166): read AS that doctor (the
// acting practice for these queries only), so the money, the payment QR,
// the procedures, the requests, the time zone and the calendar are that
// practice's. color: by her list's order (lib/doctorPalette).
async function practicePart(p: MyPractice, userId: string, color: string): Promise<{ ctx: RowPracticeCtx; tag: DoctorTagInfo; bookings: Bookings; zone: string }> {
  return inRowPractice(p.professional_id, async () => {
    const supabase = await createClient();
    const country = await getPracticeCountry(supabase, userId, p.professional_id);
    const profile = countryProfile(country);
    const [clinicResult, procsResult, bookings] = await Promise.all([
      supabase.rpc("get_my_clinic"),
      supabase.from("procedures").select("id, name, duration_minutes, price, payment_type").eq("professional_id", p.professional_id).eq("active", true).order("name"),
      getTentativeBookings(),
    ]);
    const clinic = (Array.isArray(clinicResult.data) ? clinicResult.data[0] : null) as { pix_key?: string | null; promptpay_id?: string | null; clinic_name?: string | null; clinic_city?: string | null; time_zone?: string | null } | null;
    const name = withBrandTitle(p.title, p.display_name);
    const tag: DoctorTagInfo = {
      id: p.professional_id,
      name: name || "—",
      short: shortDoctorName(name) || "—",
      color,
      calendar: profile.calendar,
    };
    return {
      tag,
      zone: validZone(clinic?.time_zone),
      ctx: {
        currency: profile.currency,
        pixKey: profile.paymentQr === "pix" ? clinic?.pix_key ?? null : null,
        promptPayId: profile.paymentQr === "promptpay" ? normalizePromptPayId(clinic?.promptpay_id) : null,
        clinicName: clinic?.clinic_name ?? "",
        clinicCity: clinic?.clinic_city ?? "",
        procedures: (procsResult.data ?? []) as RowPracticeCtx["procedures"],
        country,
      },
      bookings: ((bookings ?? []) as Bookings).map((b) => ({ ...b, practice: tag })),
    };
  });
}

// The Agenda's "Todos" (166; behind liveFeatures.multiPractice): every
// doctor she serves, each appointment with its doctor (a dot in their
// colour + the name), filter chips per doctor, and the views List / Day
// (a column per doctor) / Week / Month. Every action on an appointment
// acts for that appointment's doctor (RowPractice), with that practice's
// calendar for its dates. A new appointment or a block asks for the doctor
// first (AllAddButtons).
// date: the page's ?date, if any; without one, the shown doctors' own today
// (f0: chip Manaus opened on São Paulo's date near midnight).
export async function AllSchedule({ practices, userId, today, date, doctor, view, locale }: {
  practices: MyPractice[]; userId: string; today: string; date: string | null; doctor: string | null; view: AgendaView; locale: string;
}) {
  const [t, tp] = await Promise.all([getTranslations("schedule"), getTranslations("secretaryPractices")]);
  // Colours by her whole list (fixed per doctor); doctors whose subscription
  // lapsed are left out of "Todos", with a note (d1/cf, the app's slice 2).
  const colors = doctorColors(practices.map((p) => p.professional_id));
  const { shown: active, lapsedCount } = todosPractices(practices);
  const parts = await Promise.all(active.map((p) => practicePart(p, userId, colors.get(p.professional_id)!)));
  const byId = new Map(parts.map((x) => [x.tag.id, x]));
  const shownIds = doctor && byId.has(doctor) ? [doctor] : [...byId.keys()];
  const shown = shownIds.map((id) => byId.get(id)!);

  const zone = sharedZone(shown.map((x) => x.zone));
  const grid = view !== "list" && zone ? view : null;
  // Their shared today; across zones, her primary's (as before).
  const { today: shownToday, currentDate } = todosDay(date, zone, today, (z) => clinicDate(new Date(), z));
  const { start, end } = viewRange(grid ?? "list", currentDate);

  const supabase = await createClient();
  const cols = `id, date, patient_id, patient_name, start_time, end_time, duration_minutes, status, type, consultation_type, payment_status, payment_amount, notes, patient_note, professional_id${statusReasonLive() ? ", status_reason, status_by" : ""}`;
  const { data } = await supabase
    .from("appointments")
    .select(cols)
    .in("professional_id", shownIds)
    .gte("date", start)
    .lte("date", end)
    .order("start_time");
  const appointments = ((data ?? []) as unknown as (CalendarAppt & { professional_id: string })[])
    .filter((a) => byId.has(a.professional_id));
  const bookings = shown.flatMap((x) => x.bookings);
  const todayCount = currentDate === shownToday ? appointments.filter((a) => a.date === shownToday && a.status !== "blocked").length : null;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const chip = (id: string | null) => `${prefix}/dashboard/schedule?view=${view}${date ? `&date=${date}` : ""}${id ? `&doctor=${id}` : ""}`;
  // G4: the list's phones, only for rows whose practice shares its Pix code.
  const phones = grid ? {} : await patientPhones(supabase, appointments
    .filter((a) => { const c = byId.get(a.professional_id)!.ctx; return !!c.pixKey && !!countryProfile(c.country).paymentShare && offersPaymentQr(a); })
    .map((a) => a.patient_id));
  const doctors: CalendarDoctors = Object.fromEntries(shown.map((x) => [x.tag.id, { tag: x.tag, ctx: x.ctx }]));

  return (
    <ItemCalendar calendar={zone ? shown[0].tag.calendar : undefined}>
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          {todayCount !== null && <p className="text-sm text-slate-500 mt-0.5">{t("apptsToday", { count: todayCount })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <ViewToggle currentView={grid ?? "list"} currentDate={currentDate} disabled={zone ? [] : ["day", "week", "month"]} />
          <AllAddButtons doctors={parts.map((x) => ({ tag: x.tag, ctx: x.ctx }))} defaultDate={currentDate} preselected={doctor} />
        </div>
      </div>

      <nav data-testid="doctor-chips" className="mb-4 flex flex-wrap gap-2">
        {[{ id: null as string | null, name: tp("all"), color: null as string | null }, ...parts.map((x) => x.tag)].map((c) => {
          const on = (c.id ?? null) === (doctor && byId.has(doctor) ? doctor : null);
          return (
            <Link key={c.id ?? "all"} href={chip(c.id)} aria-current={on ? "true" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {c.color && <DoctorDot color={c.color} />}
              {c.name}
            </Link>
          );
        })}
      </nav>

      {lapsedCount > 0 && (
        <p data-testid="lapsed-hint" role="note" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">{tp("allLapsedNote", { n: lapsedCount })}</p>
      )}
      {!zone && (
        <p data-testid="zones-hint" role="note" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{tp("zonesDiffer")}</p>
      )}

      <BookingRequestsPanel bookings={bookings} />

      {grid ? (
        <CalendarView
          appointments={appointments}
          currentDate={currentDate}
          today={shownToday}
          view={grid}
          currency={shown[0].ctx.currency}
          procedures={shown[0].ctx.procedures}
          doctors={doctors}
          doctorOrder={shownIds}
        />
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3">
            <ScheduleNav currentDate={currentDate} currentView="list" today={shownToday} />
          </div>
          {appointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <p className="font-semibold text-slate-500">{currentDate === shownToday ? tp("allEmpty") : t("noAppts")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => {
                const part = byId.get(appt.professional_id)!;
                return (
                  <RowPractice key={appt.id} id={appt.professional_id}>
                    <ItemCalendar calendar={part.tag.calendar}>
                      <ScheduleRow appt={appt} ctx={{ ...part.ctx, phones }} today={shownToday} doctor={part.tag} />
                    </ItemCalendar>
                  </RowPractice>
                );
              })}
            </div>
          )}
        </>
      )}
      <ScheduleUndoToast />
    </div>
    </ItemCalendar>
  );
}
