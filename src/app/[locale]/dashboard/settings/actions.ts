"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("professionals").upsert({
    id: user.id,
    email: user.email!,
    full_name: (formData.get("full_name") as string)?.trim() || "",
    specialty: (formData.get("specialty") as string)?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateClinic(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("professionals").update({
    clinic_name: (formData.get("clinic_name") as string)?.trim() || null,
    clinic_cnpj: (formData.get("clinic_cnpj") as string)?.trim() || null,
    clinic_phone: (formData.get("clinic_phone") as string)?.trim() || null,
    clinic_website: (formData.get("clinic_website") as string)?.trim() || null,
    clinic_address: (formData.get("clinic_address") as string)?.trim() || null,
    clinic_city: (formData.get("clinic_city") as string)?.trim() || null,
    clinic_state: (formData.get("clinic_state") as string)?.trim() || null,
  }).eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export async function updateWorkingHours(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const workingHours: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const day of DAY_KEYS) {
    workingHours[day] = {
      enabled: formData.get(`${day}_enabled`) === "on",
      start: (formData.get(`${day}_start`) as string) || "08:00",
      end: (formData.get(`${day}_end`) as string) || "18:00",
    };
  }

  const { error } = await supabase.from("professionals").update({ working_hours: workingHours }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function createProcedure(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required" };

  const { error } = await supabase.from("procedures").insert({
    professional_id: user.id,
    name,
    duration_minutes: parseInt(formData.get("duration_minutes") as string) || 30,
    price: parseFloat(formData.get("price") as string) || null,
    payment_type: (formData.get("payment_type") as string) || "private",
    active: true,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function toggleProcedure(id: string, active: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("procedures").update({ active }).eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateSchedulingRules(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const raw = (formData.get("max_concurrent_bookings") as string)?.trim();
  const parsed = parseInt(raw);
  const value = !raw || isNaN(parsed) || parsed <= 0 ? null : parsed;

  const { error } = await supabase
    .from("professionals")
    .update({ max_concurrent_bookings: value })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function deleteProcedure(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("procedures").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}
