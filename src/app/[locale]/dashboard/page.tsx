import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

function formatBRL(amount: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

function getGreeting() {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-700";
    case "scheduled": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    case "late": return "bg-orange-100 text-orange-700";
    case "absent": return "bg-red-100 text-red-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;
  const prefix = locale === "en" ? "" : `/${locale}`;

  const [
    professionalResult,
    todayApptsResult,
    upcomingApptsResult,
    pendingPaymentsResult,
    patientCountResult,
    monthRevenueResult,
  ] = await Promise.all([
    supabase.from("professionals").select("full_name, specialty, photo_url").eq("id", user.id).maybeSingle(),
    supabase.from("appointments").select("id, patient_name, start_time, end_time, status, consultation_type").eq("professional_id", user.id).eq("date", today).neq("status", "blocked").order("start_time"),
    supabase.from("appointments").select("patient_name, date, start_time, consultation_type, status").eq("professional_id", user.id).gt("date", today).lte("date", nextWeekStr).neq("status", "blocked").order("date").order("start_time").limit(8),
    supabase.from("appointments").select("patient_name, payment_amount, date").eq("professional_id", user.id).eq("payment_status", "pending").neq("status", "blocked").neq("status", "cancelled"),
    supabase.from("patients").select("*", { count: "exact", head: true }).eq("professional_id", user.id),
    supabase.from("appointments").select("payment_amount").eq("professional_id", user.id).eq("payment_status", "paid").gte("date", monthStart).lte("date", today),
  ]);

  const professional = professionalResult.data;
  const todayAppts = (todayApptsResult.data ?? []) as { id: string; patient_name: string; start_time: string; end_time: string; status: string; consultation_type: string }[];
  const upcomingAppts = (upcomingApptsResult.data ?? []) as { patient_name: string; date: string; start_time: string; consultation_type: string; status: string }[];
  const pendingPayments = (pendingPaymentsResult.data ?? []) as { patient_name: string; payment_amount: number; date: string }[];
  const patientCount = patientCountResult.count ?? 0;
  const monthRevenue = (monthRevenueResult.data ?? []) as { payment_amount: number }[];

  const firstName = professional?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Doctor";
  const totalPending = pendingPayments.reduce((s, p) => s + (p.payment_amount ?? 0), 0);
  const totalRevenue = monthRevenue.reduce((s, r) => s + (r.payment_amount ?? 0), 0);
  const todayFormatted = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Greeting */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
            {getGreeting()}, Dr. {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {todayFormatted}{professional?.specialty ? ` · ${professional.specialty}` : ""}
          </p>
        </div>
        <Link href={`${prefix}/dashboard/schedule`} className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition hidden sm:block">
          + New Appointment
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href={`${prefix}/dashboard/schedule`} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-teal-200 hover:shadow-md transition-all">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-teal-600"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Appts</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{todayAppts.length}</p>
        </Link>

        <Link href={`${prefix}/dashboard/payments`} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-orange-200 hover:shadow-md transition-all">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-orange-500"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatBRL(totalPending)}</p>
          <p className="text-xs text-slate-400">{pendingPayments.length} sessions</p>
        </Link>

        <Link href={`${prefix}/dashboard/patients`} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-blue-500"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patients</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{patientCount}</p>
        </Link>

        <Link href={`${prefix}/dashboard/payments`} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:border-green-200 hover:shadow-md transition-all">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-green-600"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly Revenue</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatBRL(totalRevenue)}</p>
          <p className="text-xs text-slate-400">This month</p>
        </Link>
      </div>

      {/* Today's Schedule + Upcoming */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Today */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Today's Schedule</h2>
            <Link href={`${prefix}/dashboard/schedule`} className="text-xs font-semibold text-teal-600 hover:text-teal-700">View all →</Link>
          </div>
          {todayAppts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-slate-300"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </div>
              <p className="text-sm text-slate-400">No appointments today</p>
              <Link href={`${prefix}/dashboard/schedule`} className="mt-3 text-xs font-semibold text-teal-600 hover:underline">Schedule one →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {todayAppts.map((appt, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5 hover:border-slate-200 transition">
                  <div className="shrink-0 text-right min-w-[44px]">
                    <p className="text-sm font-bold text-slate-900">{appt.start_time?.slice(0, 5)}</p>
                    <p className="text-xs text-slate-400">{appt.end_time?.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-slate-900 text-sm">{appt.patient_name}</p>
                    <p className="text-xs text-slate-500 truncate">{appt.consultation_type}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(appt.status)}`}>{appt.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Next 7 Days</h2>
            <Link href={`${prefix}/dashboard/schedule`} className="text-xs font-semibold text-teal-600 hover:text-teal-700">View all →</Link>
          </div>
          {upcomingAppts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-slate-300"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </div>
              <p className="text-sm text-slate-400">No upcoming appointments</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppts.map((appt, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                  <div className="shrink-0 rounded-lg bg-teal-50 p-2 text-center min-w-[48px]">
                    <p className="text-xs font-bold text-teal-600 uppercase">{new Date(appt.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</p>
                    <p className="text-lg font-extrabold text-slate-900 leading-tight">{new Date(appt.date + "T12:00:00").getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-slate-900 text-sm">{appt.patient_name}</p>
                    <p className="text-xs text-slate-500">{appt.start_time?.slice(0, 5)} · {appt.consultation_type}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge(appt.status)}`}>{appt.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending payments summary */}
      {pendingPayments.length > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-orange-900">{pendingPayments.length} unpaid session{pendingPayments.length !== 1 ? "s" : ""}</h3>
              <p className="mt-1 text-sm text-orange-700">{formatBRL(totalPending)} pending collection</p>
            </div>
            <Link href={`${prefix}/dashboard/payments`} className="shrink-0 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 transition">
              Manage Payments
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
