"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { IconBadge } from "@/components/IconBadge";
import { acceptProposal, declineProposal } from "@/app/[locale]/dashboard/schedule/booking-actions";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type ProfessionalInfo = { name: string; specialty: string; clinicName?: string } | null;
type PendingRequest = { id: string; date: string; start_time: string; status: string };
type AppointmentRow = {
  id: string; date: string; start_time: string; status: string;
  proposed_date: string | null; proposed_start_time: string | null;
};

export default function PendingConfirmationPage() {
  const t = useTranslations("auth");
  // signOut lives in the top-level myAppointments namespace, not under auth.
  const tMyAppts = useTranslations("myAppointments");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [professional, setProfessional] = useState<ProfessionalInfo>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [notPending, setNotPending] = useState(false);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function load(showLoading: boolean) {
    if (showLoading) setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`${prefix}/auth/login`);
      return;
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role, invited_by_professional_id, linked_patient_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Already confirmed — accepting a proposal links the patient the same
    // way a doctor's direct confirm does, so this covers that transition.
    if (roleRow?.linked_patient_id) {
      router.push(`${prefix}/auth/patient-welcome`);
      return;
    }
    if (roleRow?.role !== "patient" || !roleRow.invited_by_professional_id) {
      setNotPending(true);
      setLoading(false);
      return;
    }

    const profId = roleRow.invited_by_professional_id as string;
    setProfessionalId(profId);

    const [{ data: profRowRaw }, { data: apptRows }] = await Promise.all([
      supabase.rpc("get_professional_public_info", { p_professional_id: profId }).maybeSingle(),
      supabase
        .from("appointments")
        .select("id, date, start_time, status, proposed_date, proposed_start_time")
        .eq("patient_auth_id", user.id)
        .eq("professional_id", profId)
        .in("status", ["tentative", "proposal"])
        .order("date", { ascending: true }),
    ]);

    const profRow = profRowRaw as { full_name: string | null; specialty: string | null; clinic_name: string | null } | null;
    setProfessional(profRow ? {
      // No hard-coded (English, gendered) fallback: without a name the page
      // uses the generic, name-free text below.
      name: profRow.full_name?.trim() ?? "",
      specialty: profRow.specialty ?? "",
      clinicName: profRow.clinic_name ?? undefined,
    } : null);
    // For a proposal, the doctor's suggested new time lives in
    // proposed_date/proposed_start_time — date/start_time still hold the
    // patient's original request until it's accepted.
    setRequests(((apptRows ?? []) as AppointmentRow[]).map((r) => ({
      id: r.id,
      status: r.status,
      date: r.status === "proposal" && r.proposed_date ? r.proposed_date : r.date,
      start_time: r.status === "proposal" && r.proposed_start_time ? r.proposed_start_time : r.start_time,
    })));
    setLoading(false);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, router]);

  async function handleAccept(id: string) {
    setActingId(id);
    setActionError("");
    const result = await acceptProposal(id);
    setActingId(null);
    if (result?.error) { setActionError(result.error); return; }
    // A successful accept links the patient (accept_appointment_proposal
    // owns that server-side) — reload to pick up the new linked state,
    // which redirects to patient-welcome above.
    await load(false);
  }

  async function handleDecline(id: string) {
    setActingId(id);
    setActionError("");
    const result = await declineProposal(id);
    setActingId(null);
    if (result?.error) { setActionError(result.error); return; }
    await load(false);
  }

  async function handleCheckAgain() {
    setChecking(true);
    const supabase = createClient();
    const { data: linkedProfId } = await supabase.rpc("get_linked_professional_id");
    setChecking(false);
    if (linkedProfId) {
      router.push(`${prefix}/auth/patient-welcome`);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`${prefix}/auth/signup`);
  }

  if (loading) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <p className="text-slate-400 text-sm">{t("pendingConfirmation.loading")}</p>
        </AuthCard>
      </AuthPageShell>
    );
  }

  if (notPending) {
    return (
      <AuthPageShell>
        <AuthCard centered>
          <h1 className="auth-heading">{t("inviteRequired.heading")}</h1>
          <p className="mb-8 text-slate-500">{t("inviteRequired.body")}</p>
          <a
            href={`${prefix}/auth/invite-required`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
          >
            {t("inviteRequired.backToSignup")}
          </a>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard centered>
        <IconBadge>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-status">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </IconBadge>

        <h1 className="auth-heading">{t("pendingConfirmation.heading")}</h1>
        <p className="mb-1 text-slate-500">
          {professional?.name
            ? t("pendingConfirmation.bodyWithDoctor", { name: professional.name })
            : t("pendingConfirmation.body")}
        </p>
        {professional?.clinicName && (
          <p className="mb-6 text-sm text-slate-400">{professional.clinicName}</p>
        )}
        {!professional?.clinicName && <div className="mb-6" />}

        {requests.length > 0 && (
          <div className="mb-6 w-full rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {t("pendingConfirmation.yourRequests")}
            </p>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="text-sm text-slate-600">
                  <div>
                    {formatDate(r.date)} · {formatTime(r.start_time)}
                    <span className="ml-2 text-xs text-slate-400">
                      {r.status === "proposal" ? t("pendingConfirmation.statusProposal") : t("pendingConfirmation.statusTentative")}
                    </span>
                  </div>
                  {r.status === "proposal" && (
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAccept(r.id)}
                        disabled={actingId === r.id}
                        className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-bold text-white hover:bg-teal-700 transition disabled:opacity-60"
                      >
                        {actingId === r.id ? "…" : t("pendingConfirmation.accept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecline(r.id)}
                        disabled={actingId === r.id}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-60"
                      >
                        {actingId === r.id ? "…" : t("pendingConfirmation.decline")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
          </div>
        )}

        {professionalId && (
          <a
            href={`${prefix}/book/${professionalId}?name=${encodeURIComponent(professional?.name ?? "")}&specialty=${encodeURIComponent(professional?.specialty ?? "")}&clinicName=${encodeURIComponent(professional?.clinicName ?? "")}`}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95"
          >
            {t("pendingConfirmation.requestAppointment")}
          </a>
        )}

        <button
          onClick={handleCheckAgain}
          disabled={checking}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-6 py-3.5 text-base font-bold text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mb-4"
        >
          {checking ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              {t("pendingConfirmation.checking")}
            </span>
          ) : (
            t("pendingConfirmation.checkAgain")
          )}
        </button>

        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-teal-600 transition"
        >
          {tMyAppts("signOut")}
        </button>
      </AuthCard>
    </AuthPageShell>
  );
}
