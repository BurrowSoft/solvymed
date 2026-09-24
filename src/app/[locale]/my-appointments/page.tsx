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

export default async function MyAppointmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("invited_by_professional_id, linked_patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let myProfessionalId = (userRoleData?.invited_by_professional_id as string | null) ?? null;
  if (!myProfessionalId && userRoleData?.linked_patient_id) {
    // NOTE: patients cannot read the patients table via RLS (confirmed —
    // this always returns null for that case, even for the patient's own
    // linked row). Needs a SECURITY DEFINER RPC on the mobile/migrations
    // side, same pattern as get_manual_patient_profile. Tracked separately;
    // until then, invited_by_professional_id-linked patients (the normal
    // signup-with-code path) work fine, this only affects patients linked
    // via a pre-existing record a professional added manually.
    const { data: patientRow } = await supabase
      .from("patients")
      .select("professional_id")
      .eq("id", userRoleData.linked_patient_id as string)
      .maybeSingle();
    myProfessionalId = (patientRow?.professional_id as string | null) ?? null;
  }

  let myProfessionalMeta: { name: string; specialty: string; clinicName?: string } | null = null;
  if (myProfessionalId) {
    const { data: profRow } = await supabase
      .from("professionals")
      .select("full_name, specialty, clinic_name")
      .eq("user_id", myProfessionalId)
      .maybeSingle();
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
