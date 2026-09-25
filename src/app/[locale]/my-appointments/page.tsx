import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyAppointmentsClient } from "./MyAppointmentsClient";

export type PatientAppointment = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  consultation_type: string;
  type: string;
  notes: string | null;
  professional_id: string;
  proposed_date: string | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  scheduled_by: string | null;
};

export default async function MyAppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id, linked_patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!userRoleData?.role && user.user_metadata?.role === "patient") {
    // Pending patient (invite code never resolved) — no linked doctor yet,
    // send to the retry form instead of rendering an empty appointments page.
    redirect(`${prefix}/auth/invite-required`);
  }
  if (userRoleData?.role === "patient" && userRoleData.invited_by_professional_id && !userRoleData.linked_patient_id) {
    // Linked to a doctor's "orbit" but not yet confirmed — no
    // patient_connections yet, so there's nothing to book or show here.
    redirect(`${prefix}/auth/pending-confirmation`);
  }
  if (userRoleData?.role && userRoleData.role !== "patient") {
    // Professional/secretary landed here directly — this page is patient-only.
    redirect(`${prefix}/dashboard`);
  }

  let myProfessionalId = (userRoleData?.invited_by_professional_id as string | null) ?? null;
  if (!myProfessionalId && userRoleData?.linked_patient_id) {
    // Patients can't read the patients table directly via RLS, even their own
    // linked row — get_linked_professional_id() is a SECURITY DEFINER RPC that
    // bridges linked_patient_id -> patients.professional_id for the caller only.
    const { data: linkedProfId } = await supabase.rpc("get_linked_professional_id");
    myProfessionalId = (linkedProfId as string | null) ?? null;
  }

  // Patients can't read the professionals table directly via RLS
  // (book/[professionalId]/page.tsx documents the same limitation for
  // working hours) — get_professional_public_info() is the matching
  // SECURITY DEFINER RPC for display info.
  let myProfessionalMeta: { name: string; specialty: string; clinicName?: string } | null = null;
  if (myProfessionalId) {
    const { data: profRowRaw } = await supabase
      .rpc("get_professional_public_info", { p_professional_id: myProfessionalId })
      .maybeSingle();
    const profRow = profRowRaw as { full_name: string | null; specialty: string | null; clinic_name: string | null } | null;
    if (profRow) {
      myProfessionalMeta = {
        name: (profRow.full_name as string | null) ?? "Doctor",
        specialty: (profRow.specialty as string | null) ?? "",
        clinicName: (profRow.clinic_name as string | null) ?? undefined,
      };
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: upcoming } = await supabase
    .from("appointments")
    .select("id, date, start_time, end_time, status, consultation_type, type, notes, professional_id, proposed_date, proposed_start_time, proposed_end_time, scheduled_by")
    .eq("patient_auth_id", user.id)
    .gte("date", today)
    .not("status", "in", '("cancelled","completed","blocked","rejected")')
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  const { data: past } = await supabase
    .from("appointments")
    .select("id, date, start_time, end_time, status, consultation_type, type, notes, professional_id, proposed_date, proposed_start_time, proposed_end_time, scheduled_by")
    .eq("patient_auth_id", user.id)
    .lt("date", today)
    .in("status", ["completed", "confirmed", "scheduled"])
    .order("date", { ascending: false })
    .limit(5);

  return (
    <MyAppointmentsClient
      upcoming={upcoming ?? []}
      past={past ?? []}
      userEmail={user.email ?? ""}
      myProfessionalId={myProfessionalId}
      myProfessionalMeta={myProfessionalMeta}
    />
  );
}
