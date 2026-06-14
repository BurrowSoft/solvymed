"use client";

import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { acceptProposal, declineProposal } from "@/app/[locale]/dashboard/schedule/booking-actions";
import type { PatientAppointment } from "./page";

const STATUS_COLOR: Record<string, string> = {
  tentative: "bg-amber-50 text-amber-600 border-amber-200",
  proposal:  "bg-blue-50 text-blue-600 border-blue-200",
  scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-300",
  completed: "bg-slate-50 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-500 border-red-200",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const STATUS_KEY: Record<string, string> = {
  tentative: "statusTentative", proposal: "statusProposal", scheduled: "statusScheduled",
  confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled",
  late: "statusLate", absent: "statusAbsent", blocked: "statusBlocked",
};

function AppointmentCard({ appt, onMutate }: { appt: PatientAppointment; onMutate: () => void }) {
  const t = useTranslations("schedule");
  const [pending, startTransition] = useTransition();
  const color = STATUS_COLOR[appt.status] ?? "bg-slate-50 text-slate-500 border-slate-200";
  const label = STATUS_KEY[appt.status] ? t(STATUS_KEY[appt.status]) : appt.status;
  const isProposal = appt.status === "proposal" && !!appt.proposed_date;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900">{appt.consultation_type}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDate(isProposal ? appt.proposed_date! : appt.date)} · {formatTime(isProposal ? appt.proposed_start_time! : appt.start_time)} – {formatTime(isProposal ? appt.proposed_end_time! : appt.end_time)}
          </p>
          {isProposal && (
            <p className="text-xs text-slate-400 mt-0.5">
              Originally: {formatDate(appt.date)} · {formatTime(appt.start_time)}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{appt.type.replace("-", " ")}</p>
          {appt.notes && (
            <p className="mt-2 text-sm text-slate-600 italic">&ldquo;{appt.notes}&rdquo;</p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}>
          {label}
        </span>
      </div>

      {isProposal && (
        <div className="flex gap-2 mt-4">
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await acceptProposal(appt.id); onMutate(); })}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 transition"
          >
            ✓ Accept
          </button>
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await declineProposal(appt.id); onMutate(); })}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-50 transition"
          >
            ✕ Decline
          </button>
        </div>
      )}
    </div>
  );
}

export function MyAppointmentsClient({
  upcoming,
  past,
  userEmail,
}: {
  upcoming: PatientAppointment[];
  past: PatientAppointment[];
  userEmail: string;
}) {
  const t = useTranslations("myAppointments");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const refresh = () => router.refresh();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/login`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-900">Solvymed</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`${prefix}/discover`}
              className="text-sm font-medium text-teal-600 hover:underline"
            >
              {t("bookAppointment")}
            </a>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-700 transition"
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{userEmail}</p>
        </div>

        {/* Upcoming */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("upcoming")}</h2>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-slate-300 mb-3">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <p className="font-semibold text-slate-600">{t("noUpcoming")}</p>
              <p className="text-sm text-slate-400 mt-1 mb-5">{t("noUpcomingSub")}</p>
              <a
                href={`${prefix}/discover`}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition"
              >
                {t("bookAppointment")}
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} />)}
            </div>
          )}
        </section>

        {/* Past */}
        {past.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t("recentHistory")}</h2>
            <div className="space-y-3">
              {past.map((a) => <AppointmentCard key={a.id} appt={a} onMutate={refresh} />)}
            </div>
          </section>
        )}

        {/* CTA if no upcoming */}
        {upcoming.length === 0 && (
          <div className="rounded-2xl bg-teal-600 p-6 text-white text-center">
            <p className="font-bold text-lg mb-1">{t("ctaTitle")}</p>
            <p className="text-teal-100 text-sm mb-4">{t("ctaSub")}</p>
            <a
              href={`${prefix}/discover`}
              className="inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50 transition"
            >
              {t("bookAppointment")}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
