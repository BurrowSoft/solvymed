"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";

// Duration is already bounded to 480 (8h), but that alone doesn't stop a
// late start_time from producing an end time past midnight (e.g. 23:00 +
// 480min = "31:00", not a storable/valid time). Returns null when the
// slot would cross into the next day.
function computeEndTime(startTime: string, durationMinutes: number): string | null {
  const [h, m] = startTime.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const endTotal = h * 60 + m + durationMinutes;
  if (endTotal > 24 * 60) return null;
  return `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
}

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const patientName = formData.get("patient_name") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const consultationType = formData.get("consultation_type") as string;
  const type = (formData.get("type") as string) || "in-person";
  const paymentType = (formData.get("payment_type") as string) || "private";
  const notes = formData.get("notes") as string;

  if (!patientName || !date || !startTime) return { error: "Missing required fields" };

  const parsedDuration = parseInt(durationStr);
  const duration = Number.isInteger(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480 ? parsedDuration : 30;
  const endTime = computeEndTime(startTime, duration);
  if (!endTime) return { error: "This time and duration would run past midnight" };

  // Find patient_id by name (best-effort match)
  const { data: patients } = await supabase
    .from("patients")
    .select("id")
    .eq("professional_id", effectiveProfId)
    .ilike("full_name", patientName.trim())
    .limit(1);

  const patientId = patients?.[0]?.id ?? null;

  const { error } = await supabase.from("appointments").insert({
    professional_id: effectiveProfId,
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

// tentative/proposal/rejected are deliberately excluded — those are
// workflow-only statuses owned by confirmBookingAndAddPatient,
// rejectBooking, and proposeNewTime (booking-actions.ts), which also
// handle confirm_and_link_patient / notifying the patient. This generic
// action must never be able to set OR move an appointment out of one of
// those states, or a booking request can be confirmed without linking the
// patient (reported by mob dev: mobile hit the identical bug through its
// own generic status control) or an ordinary appointment can be pushed
// into a fake booking-request state with no real request behind it.
const VALID_APPOINTMENT_STATUSES = [
  "scheduled", "confirmed", "completed", "cancelled", "blocked", "late", "absent",
];

export async function updateAppointmentStatus(id: string, status: string) {
  // Returns a stable code (not raw text) — the caller renders it through
  // next-intl.
  if (!VALID_APPOINTMENT_STATUSES.includes(status)) return { error: "Invalid status", code: "generic" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  // The tentative/proposal exclusion is enforced in the same atomic write
  // as the update itself (not a separate read-then-write, which would be
  // a TOCTOU race against a concurrent booking-card action) — a 0-row
  // result means either no such appointment for this professional, or it
  // was in a workflow-only status.
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("professional_id", effectiveProfId)
    .not("status", "in", '("tentative","proposal")')
    .select("id");

  if (error) return { error: error.message, code: "generic" };
  if (!data || data.length === 0) {
    return { error: "Use the booking request card to confirm, reject, or propose a time for this request", code: "use_booking_card" };
  }

  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function deleteAppointment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function blockTime(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);

  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const durationStr = formData.get("duration_minutes") as string;
  const reason = formData.get("reason") as string;

  if (!date || !startTime) return { error: "Missing required fields" };

  const parsedDuration = parseInt(durationStr);
  const duration = Number.isInteger(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480 ? parsedDuration : 60;
  const endTime = computeEndTime(startTime, duration);
  if (!endTime) return { error: "This time and duration would run past midnight" };

  const { error } = await supabase.from("appointments").insert({
    professional_id: effectiveProfId,
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
