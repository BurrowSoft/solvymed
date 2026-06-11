import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

const EXPO_APK_URL =
  "https://expo.dev/accounts/burrowsoftmobile/projects/solvymed/builds/12e3fe6b-ffe3-4157-b8f7-81b46441be9a";

function formatBRL(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function getGreeting() {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function getStatusStyle(status: string) {
  switch (status) {
    case "confirmed":
      return "bg-teal-100 text-teal-700";
    case "scheduled":
      return "bg-amber-100 text-amber-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

type Appointment = {
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  payment_amount: number;
  consultation_type: string;
  type?: string;
};

type UpcomingAppointment = {
  patient_name: string;
  date: string;
  start_time: string;
  consultation_type: string;
  status: string;
};

type PendingPayment = {
  patient_name: string;
  payment_amount: number;
  date: string;
};

type RevenueItem = {
  payment_amount: number;
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  }

  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;

  // Fetch all data in parallel
  const [
    professionalResult,
    todayApptsResult,
    upcomingApptsResult,
    pendingPaymentsResult,
    patientCountResult,
    monthRevenueResult,
  ] = await Promise.all([
    supabase
      .from("professionals")
      .select("full_name, email, specialty, photo_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("appointments")
      .select("*")
      .eq("professional_id", user.id)
      .eq("date", today)
      .neq("status", "blocked")
      .order("start_time"),
    supabase
      .from("appointments")
      .select("patient_name, date, start_time, consultation_type, status")
      .eq("professional_id", user.id)
      .gt("date", today)
      .lte("date", nextWeekStr)
      .neq("status", "blocked")
      .order("date")
      .order("start_time")
      .limit(10),
    supabase
      .from("appointments")
      .select("patient_name, payment_amount, date")
      .eq("professional_id", user.id)
      .eq("payment_status", "pending")
      .neq("status", "blocked")
      .neq("status", "cancelled"),
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("professional_id", user.id),
    supabase
      .from("appointments")
      .select("payment_amount")
      .eq("professional_id", user.id)
      .eq("payment_status", "paid")
      .gte("date", monthStart)
      .lte("date", today),
  ]);

  const professional = professionalResult.data;
  const todayAppts: Appointment[] = (todayApptsResult.data as Appointment[]) ?? [];
  const upcomingAppts: UpcomingAppointment[] = (upcomingApptsResult.data as UpcomingAppointment[]) ?? [];
  const pendingPayments: PendingPayment[] = (pendingPaymentsResult.data as PendingPayment[]) ?? [];
  const patientCount = patientCountResult.count ?? 0;
  const monthRevenue = (monthRevenueResult.data as RevenueItem[] | null) ?? [];

  const firstName = professional?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Doctor";
  const greeting = getGreeting();

  const totalPendingAmount = pendingPayments.reduce(
    (sum, p) => sum + (p.payment_amount ?? 0),
    0
  );
  const totalMonthRevenue = monthRevenue.reduce(
    (sum, r) => sum + (r.payment_amount ?? 0),
    0
  );

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Solvymed
            </span>
            <span className="ml-2 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
              Dashboard
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
            {greeting}, Dr. {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {todayFormatted}
            {professional?.specialty ? ` · ${professional.specialty}` : ""}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Today's appointments */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-teal-600"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Today&apos;s Appointments
            </p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">
              {todayAppts.length}
            </p>
          </div>

          {/* Pending payments */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-orange-500"
              >
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Pending Payments
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatBRL(totalPendingAmount)}
            </p>
            <p className="text-xs text-slate-400">{pendingPayments.length} sessions</p>
          </div>

          {/* Total patients */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-blue-500"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Total Patients
            </p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">
              {patientCount}
            </p>
          </div>

          {/* Monthly revenue */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-green-600"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Monthly Revenue
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatBRL(totalMonthRevenue)}
            </p>
            <p className="text-xs text-slate-400">This month</p>
          </div>
        </div>

        {/* Schedule + Upcoming */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Today's Schedule */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Today&apos;s Schedule
            </h2>
            {todayAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 text-slate-400"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">No appointments today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppts.map((appt, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {appt.start_time?.slice(0, 5)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {appt.end_time?.slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {appt.patient_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {appt.consultation_type}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusStyle(appt.status)}`}
                    >
                      {appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming appointments */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Upcoming (Next 7 Days)
            </h2>
            {upcomingAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 text-slate-400"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">No upcoming appointments</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppts.map((appt, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    <div className="shrink-0 rounded-lg bg-slate-50 p-2 text-center min-w-[52px]">
                      <p className="text-xs font-bold text-teal-600 uppercase">
                        {new Date(appt.date + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short" }
                        )}
                      </p>
                      <p className="text-lg font-extrabold text-slate-900 leading-tight">
                        {new Date(appt.date + "T00:00:00").getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {appt.patient_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {appt.start_time?.slice(0, 5)} · {appt.consultation_type}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusStyle(appt.status)}`}
                    >
                      {appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Open in App banner */}
        <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-teal-100/50 p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-teal-900">For the full experience</h3>
              <p className="mt-1 text-sm text-teal-700">
                Open SolvyMed on your phone to access all features — scheduling,
                prescriptions, clinical records, and more.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <a
                href="solvymed://"
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-teal-700 active:scale-95 whitespace-nowrap"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
                Open App
              </a>
              <a
                href={EXPO_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-5 py-2.5 text-sm font-bold text-teal-700 transition hover:bg-teal-50 active:scale-95 whitespace-nowrap"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
                </svg>
                Download APK
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
