// A patient's doctors (1.5.0, migration 164; behind liveFeatures.multiDoctor).
// get_my_doctors() is the ONLY doctor list a patient can read (no
// directory): their own connections, the primary first, open practices
// only, with each doctor's brand. Only the doctor's own 1.5.0 images are
// shown, never a legacy photo (old profile photos were never public; e7).
import type { SupabaseClient } from "@supabase/supabase-js";
import { assetUrl } from "./brand";
import { withBrandTitle } from "./doctorName";

export type MyDoctorRow = {
  professional_id: string;
  patient_id: string | null;
  via: string | null;
  is_primary: boolean;
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  accent_color: string | null;
  logo_square_path: string | null;
  photo_path: string | null;
  legacy_photo_url: string | null;
  accepts_bookings: boolean | null;
  connected_at: string | null;
};

export type MyDoctor = {
  id: string;
  name: string; // title + name, as shown
  specialty: string;
  accentColor: string | null;
  logoUrl: string | null;
  photoUrl: string | null;
  isPrimary: boolean;
  acceptsBookings: boolean;
};

export function toMyDoctor(supabase: Pick<SupabaseClient, "storage">, r: MyDoctorRow): MyDoctor {
  return {
    id: r.professional_id,
    name: withBrandTitle(r.title, r.display_name),
    specialty: (r.specialty ?? "").trim(),
    accentColor: r.accent_color,
    logoUrl: assetUrl(supabase, r.logo_square_path),
    photoUrl: assetUrl(supabase, r.photo_path),
    isPrimary: r.is_primary,
    // Only an explicit false stops booking (141's rule: unknown books).
    acceptsBookings: r.accepts_bookings !== false,
  };
}

// The list, or null when it can't be read (the page then shows the single
// doctor as before).
export async function loadMyDoctors(supabase: SupabaseClient): Promise<MyDoctor[] | null> {
  const { data, error } = await supabase.rpc("get_my_doctors");
  if (error) return null;
  return ((data ?? []) as MyDoctorRow[]).map((r) => toMyDoctor(supabase, r));
}

// The server's go-live switches (get_server_flags, 163/164): a patient can
// add a second doctor only while multi_doctor_patient is on.
export async function serverFlag(supabase: SupabaseClient, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_server_flags");
  if (error) return false;
  return ((data ?? []) as { key: string; enabled: boolean }[]).some((f) => f.key === key && f.enabled === true);
}
