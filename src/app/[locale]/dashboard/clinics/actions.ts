"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function geocode(address: string, city: string, country: string) {
  try {
    const q = [address, city, country].filter(Boolean).join(", ");
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { "User-Agent": "SolvyMed/1.0" }, next: { revalidate: 0 } },
    );
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json.length) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

export async function addClinic(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Clinic name is required" };

  const address = (formData.get("address") as string)?.trim() || null;
  const city    = (formData.get("city")    as string)?.trim() || null;
  const state   = (formData.get("state")   as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const phone   = (formData.get("phone")   as string)?.trim() || null;

  const coords = address || city
    ? await geocode(address ?? "", city ?? "", country ?? "")
    : null;

  const { data: clinic, error } = await supabase
    .from("clinics")
    .insert({
      professional_id: user.id,
      name,
      address,
      city,
      state,
      country,
      phone,
      lat:  coords?.lat ?? null,
      lng:  coords?.lng ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Link the creating doctor as a member of the clinic
  await supabase
    .from("clinic_professionals")
    .insert({ clinic_id: clinic.id, professional_id: user.id });

  revalidatePath("/dashboard/clinics");
  return { success: true };
}

export async function deleteClinic(clinicId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("clinics")
    .delete()
    .eq("id", clinicId)
    .eq("professional_id", user.id); // owner-only guard

  if (error) return { error: error.message };
  revalidatePath("/dashboard/clinics");
  return { success: true };
}
