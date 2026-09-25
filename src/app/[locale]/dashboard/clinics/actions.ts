"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";

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
  if (!user) return { error: "Unauthorized", code: "generic" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinics", code: "generic" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Clinic name is required", code: "name_required" };

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

  if (error) return { error: error.message, code: "generic" };

  // Link the creating doctor as a member of the clinic. These two inserts
  // aren't atomic (no RPC wraps them in a transaction) — if this one fails,
  // compensate by deleting the clinic row rather than leaving an orphaned
  // clinic with no owner link and reporting success anyway.
  const { error: linkError } = await supabase
    .from("clinic_professionals")
    .insert({ clinic_id: clinic.id, professional_id: user.id });

  if (linkError) {
    const { error: cleanupError } = await supabase.from("clinics").delete().eq("id", clinic.id);
    if (cleanupError) {
      // The compensating delete itself isn't guaranteed either — without a
      // real transaction/RPC there's no way to make this fully atomic from
      // here. Log distinctly so an orphaned clinic (id in the log) can be
      // found and cleaned up manually, rather than silently leaving it with
      // only the original link error visible.
      console.error(`Orphaned clinic ${clinic.id}: link insert failed (${linkError.message}) and cleanup delete also failed (${cleanupError.message})`);
    }
    return { error: linkError.message, code: "generic" };
  }

  revalidatePath("/dashboard/clinics");
  return { success: true };
}

export async function deleteClinic(clinicId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can manage clinics", code: "generic" };

  const { error } = await supabase
    .from("clinics")
    .delete()
    .eq("id", clinicId)
    .eq("professional_id", user.id); // owner-only guard

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/clinics");
  return { success: true };
}
