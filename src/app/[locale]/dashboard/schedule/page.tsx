import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScheduleNav, NewAppointmentButton, BlockTimeButton, AppointmentStatusSelect, DeleteAppointmentButton } from "./ScheduleClient";
import { BookingRequestsPanel } from "./BookingRequestsPanel";
import { getTentativeBookings } from "./booking-actions";

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
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  const { date: dateParam } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const today = new Date().toISOString().split("T")[0];
  const currentDate = dateParam ?? today;

  const [apptsResult, patientsResult, procsResult, tentativeBookings] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, patient_name, start_time, end_time, duration_minutes, status, type, consultation_type, payment_status, payment_amount, notes")
      .eq("professional_id", user.id)
      .eq("date", currentDate)
      .order("start_time"),
    supabase
      .from("patients")
      .select("id, full_name")
      .eq("professional_id", user.id)
      .order("full_name"),
    supabase
      .from("procedures")
      .select("id, name, duration_minutes, price, payment_type")
      .eq("professional_id", user.id)
      .eq("active", true)
      .order("name"),
    getTentativeBookings(),
  ]);

  const appointments = (apptsResult.data ?? []) as {
    id: string; patient_name: string; start_time: string; end_time: string;
    duration_minutes: number; status: string; type: string; consultation_type: string;
    payment_status: string; payment_amount?: number; notes?: string;
  }[];
  const patients = (patientsResult.data ?? []) as { id: string; full_name: string }[];
  const procedures = (procsResult.data ?? []) as { id: string; name: string; duration_minutes: number; price?: number; payment_type: string }[];

  const regularAppts = appointments.filter(a => a.status !== "blocked");
  const blockedSlots = appointments.filter(a => a.status === "blocked");

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">{regularAppts.length} appointment{regularAppts.length !== 1 ? "s" : ""} scheduled</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BlockTimeButton defaultDate={currentDate} />
          <NewAppointmentButton patients={patients} defaultDate={currentDate} procedures={procedures} />
        </div>
      </div>

      {/* Date Navigation */}
      <div className="mb-6 flex items-center gap-3">
        <ScheduleNav currentDate={currentDate} />
      </div>

      {/* Booking Requests */}
      <BookingRequestsPanel bookings={tentativeBookings as Parameters<typeof BookingRequestsPanel>[0]["bookings"]} />

      {/* Appointments */}
      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-slate-300">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </div>
          <p className="font-semibold text-slate-500">No appointments on this day</p>
          <p className="text-sm text-slate-400 mt-1">Use the button above to schedule one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className={`group flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                appt.status === "blocked" ? "border-slate-100 opacity-75" : "border-slate-100 hover:border-slate-200"
              }`}
            >
              {/* Time */}
              <div className="shrink-0 text-right min-w-[52px]">
                <p className="text-sm font-bold text-slate-900">{appt.start_time?.slice(0, 5)}</p>
                <p className="text-xs text-slate-400">{appt.end_time?.slice(0, 5)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{appt.duration_minutes}m</p>
              </div>

              {/* Divider */}
              <div className={`mt-1 h-full w-0.5 self-stretch rounded-full ${appt.status === "blocked" ? "bg-slate-200" : "bg-teal-200"}`} style={{ minHeight: 40 }} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{appt.patient_name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {appt.consultation_type}
                      {appt.type === "online" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-semibold">Online</span>}
                    </p>
                    {appt.notes && <p className="text-xs text-slate-400 mt-1 truncate">{appt.notes}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {appt.status !== "blocked" && (
                      <AppointmentStatusSelect id={appt.id} current={appt.status} />
                    )}
                    {appt.status === "blocked" && (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge(appt.status)}`}>Blocked</span>
                    )}
                    <DeleteAppointmentButton id={appt.id} />
                  </div>
                </div>
                {appt.status !== "blocked" && (
                  <div className="mt-2 flex items-center gap-3">
                    <span className={`text-xs font-semibold ${appt.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                      {appt.payment_status === "paid" ? "✓ Paid" : "⏳ Pending"}
                      {appt.payment_amount ? ` · R$ ${appt.payment_amount.toFixed(2)}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
