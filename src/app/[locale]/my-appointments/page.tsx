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
};

export default async function MyAppointmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const today = new Date().toISOString().split("T")[0];

  const { data: upcoming } = await supabase
    .from("appointments")
    .select("id, date, start_time, end_time, status, consultation_type, type, notes, professional_id, proposed_date, proposed_start_time, proposed_end_time")
    .eq("patient_auth_id", user.id)
    .gte("date", today)
    .not("status", "in", '("cancelled","completed","blocked","rejected")')
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  const { data: past } = await supabase
    .from("appointments")
    .select("id, date, start_time, end_time, status, consultation_type, type, notes, professional_id, proposed_date, proposed_start_time, proposed_end_time")
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
    />
  );
}
