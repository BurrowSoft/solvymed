"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const patientName = formData.get("patient_name") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const consultationType = formData.get("consultation_type") as string;
  const type = (formData.get("type") as string) || "in-person";
  const paymentType = (formData.get("payment_type") as string) || "private";
  const notes = formData.get("notes") as string;

  if (!patientName || !date || !startTime) return { error: "Missing required fields" };

  const duration = parseInt(durationStr) || 30;
  const [h, m] = startTime.split(":").map(Number);
  const endTotal = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  // Find patient_id by name (best-effort match)
  const { data: patients } = await supabase
    .from("patients")
    .select("id")
    .eq("professional_id", user.id)
    .ilike("full_name", patientName.trim())
    .limit(1);

  const patientId = patients?.[0]?.id ?? null;

  const { error } = await supabase.from("appointments").insert({
    professional_id: user.id,
    patient_id: patientId,
    patient_name: patientName.trim(),
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration,
    type,
    consultation_type: consultationType || "Consultation",
    payment_type: paymentType,
    payment_status: "pending",
    status: "scheduled",
    notes: notes || null,
    scheduled_by: "professional",
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function deleteAppointment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function blockTime(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const reason = formData.get("reason") as string;

  if (!date || !startTime) return { error: "Missing required fields" };

  const duration = parseInt(durationStr) || 60;
  const [h, m] = startTime.split(":").map(Number);
  const endTotal = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  const { error } = await supabase.from("appointments").insert({
    professional_id: user.id,
    patient_id: null,
    patient_name: reason || "Blocked",
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration,
    type: "in-person",
    consultation_type: reason || "Blocked",
    payment_type: "private",
    payment_status: "pending",
    status: "blocked",
    scheduled_by: "professional",
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}
