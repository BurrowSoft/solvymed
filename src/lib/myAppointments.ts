import type { SupabaseClient } from "@supabase/supabase-js";

// A patient's own appointments (migration 106, notes privacy hotfix): only
// through get_my_appointments, a definer RPC with explicit columns. The
// clinic's `notes` are never among them; `patient_note` is the patient's
// own booking message. A patient's direct reads of `appointments` return
// nothing once 106 drops the whole-row policy.
export type MyAppointment = {
  id: string;
  professional_id: string;
  patient_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  type: string;
  consultation_type: string;
  status: string;
  scheduled_by: string | null;
  proposed_date: string | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  patient_note: string | null;
};

export async function myAppointments(db: SupabaseClient, appointmentId?: string): Promise<MyAppointment[]> {
  const { data, error } = await db.rpc("get_my_appointments", appointmentId ? { p_appointment_id: appointmentId } : {});
  if (error || !Array.isArray(data)) return [];
  return data as MyAppointment[];
}

// One of the caller's own appointments, or null.
export async function myAppointment(db: SupabaseClient, appointmentId: string): Promise<MyAppointment | null> {
  return (await myAppointments(db, appointmentId)).find((a) => a.id === appointmentId) ?? null;
}
