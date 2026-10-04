import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { inRowPractice } from "@/lib/rowPractice";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { normalizePromptPayId } from "@/lib/promptpay";
import { withBrandTitle } from "@/lib/doctorName";
import { statusReasonLive } from "@/lib/statusReason";
import type { MyPractice } from "@/lib/actingPractice";
import { RowPractice } from "@/components/RowPractice";
import { AutoRefresh } from "@/components/AutoRefresh";
import type { DoctorTagInfo } from "@/components/DoctorTag";
import { brandAccent, readableAccent } from "@/lib/readableAccent";
import { ScheduleNav, ScheduleUndoToast } from "./ScheduleClient";
import { BookingRequestsPanel } from "./BookingRequestsPanel";
import { getTentativeBookings } from "./booking-actions";
import { ScheduleRow, type RowPracticeCtx } from "./ScheduleRow";
import { AllAddButtons } from "./AllAddButtons";
import type { CalendarAppt } from "./CalendarView";

type Bookings = Parameters<typeof BookingRequestsPanel>[0]["bookings"];

// One doctor's part of the "All" schedule (166): read AS that doctor (the
// acting practice for these queries only), so the money, the payment QR,
// the procedures and the requests are that practice's.
async function practicePart(p: MyPractice, userId: string): Promise<{ ctx: RowPracticeCtx; tag: DoctorTagInfo; bookings: Bookings }> {
  return inRowPractice(p.professional_id, async () => {
    const supabase = await createClient();
    const country = await getPracticeCountry(supabase, userId, p.professional_id);
    const profile = countryProfile(country);
    const [clinicResult, procsResult, bookings] = await Promise.all([
      supabase.rpc("get_my_clinic"),
      supabase.from("procedures").select("id, name, duration_minutes, price, payment_type").eq("professional_id", p.professional_id).eq("active", true).order("name"),
      getTentativeBookings(),
    ]);
    const clinic = (Array.isArray(clinicResult.data) ? clinicResult.data[0] : null) as { pix_key?: string | null; promptpay_id?: string | null; clinic_name?: string | null; clinic_city?: string | null } | null;
    const tag: DoctorTagInfo = { id: p.professional_id, name: withBrandTitle(p.title, p.display_name) || "—", accent: p.accent_color };
    return {
      tag,
      ctx: {
        currency: profile.currency,
        pixKey: profile.paymentQr === "pix" ? clinic?.pix_key ?? null : null,
        promptPayId: profile.paymentQr === "promptpay" ? normalizePromptPayId(clinic?.promptpay_id) : null,
        clinicName: clinic?.clinic_name ?? "",
        clinicCity: clinic?.clinic_city ?? "",
        procedures: (procsResult.data ?? []) as RowPracticeCtx["procedures"],
      },
      bookings: ((bookings ?? []) as Bookings).map((b) => ({ ...b, practice: tag })),
    };
  });
}

// The Agenda's "Todos" (166; behind liveFeatures.multiPractice): the day of
// every doctor she serves in one list by time, each appointment with its
// doctor (a dot in their colour + the name) and filter chips per doctor.
// Every action on a row acts for that row's doctor (RowPractice). A new
// appointment or a block asks for the doctor first (AllAddButtons).
export async function AllSchedule({ practices, userId, today, currentDate, doctor, locale }: {
  practices: MyPractice[]; userId: string; today: string; currentDate: string; doctor: string | null; locale: string;
}) {
  const [t, tp] = await Promise.all([getTranslations("schedule"), getTranslations("secretaryPractices")]);
  const parts = await Promise.all(practices.map((p) => practicePart(p, userId)));
  const byId = new Map(parts.map((x) => [x.tag.id, x]));
  const shownIds = doctor && byId.has(doctor) ? [doctor] : [...byId.keys()];

  const supabase = await createClient();
  const cols = `id, date, patient_id, patient_name, start_time, end_time, duration_minutes, status, type, consultation_type, payment_status, payment_amount, notes, patient_note, professional_id${statusReasonLive() ? ", status_reason, status_by" : ""}`;
  const { data } = await supabase
    .from("appointments")
    .select(cols)
    .in("professional_id", shownIds)
    .eq("date", currentDate)
    .order("start_time");
  const appointments = ((data ?? []) as unknown as (CalendarAppt & { professional_id: string })[])
    .filter((a) => byId.has(a.professional_id));
  const bookings = parts.filter((x) => shownIds.includes(x.tag.id)).flatMap((x) => x.bookings);
  const todayCount = currentDate === today ? appointments.filter((a) => a.status !== "blocked").length : null;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const chip = (id: string | null) => `${prefix}/dashboard/schedule?date=${currentDate}${id ? `&doctor=${id}` : ""}`;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          {todayCount !== null && <p className="text-sm text-slate-500 mt-0.5">{t("apptsToday", { count: todayCount })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <AllAddButtons doctors={parts.map((x) => ({ tag: x.tag, ctx: x.ctx }))} defaultDate={currentDate} preselected={doctor} />
        </div>
      </div>

      <nav data-testid="doctor-chips" className="mb-4 flex flex-wrap gap-2">
        {[{ id: null as string | null, name: tp("all"), accent: null as string | null }, ...parts.map((x) => x.tag)].map((c) => {
          const on = (c.id ?? null) === (doctor && byId.has(doctor) ? doctor : null);
          return (
            <Link key={c.id ?? "all"} href={chip(c.id)} aria-current={on ? "true" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {c.id && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: readableAccent(brandAccent(c.accent), "#ffffff") }} />}
              {c.name}
            </Link>
          );
        })}
      </nav>

      <BookingRequestsPanel bookings={bookings} />

      <div className="mb-6 flex items-center gap-3">
        <ScheduleNav currentDate={currentDate} currentView="list" today={today} />
      </div>
      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <p className="font-semibold text-slate-500">{currentDate === today ? tp("allEmpty") : t("noAppts")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => {
            const part = byId.get(appt.professional_id)!;
            return (
              <RowPractice key={appt.id} id={appt.professional_id}>
                <ScheduleRow appt={appt} ctx={part.ctx} today={today} doctor={part.tag} />
              </RowPractice>
            );
          })}
        </div>
      )}
      <ScheduleUndoToast />
    </div>
  );
}
