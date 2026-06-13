import { createClient } from "@/lib/supabase/server";
import { DiscoverClient } from "./DiscoverClient";

export type ClinicListing = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  phone?: string;
  lat?: number;
  lng?: number;
  professionals: {
    id: string;
    name: string;
    specialty?: string;
    photoUrl?: string;
    inviteCode?: string;
  }[];
};

export default async function DiscoverPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_public_clinics");

  // Group rows by clinic id
  const clinicMap = new Map<string, ClinicListing>();
  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>;
    const id = r.clinic_id as string;
    if (!clinicMap.has(id)) {
      clinicMap.set(id, {
        id,
        name: r.clinic_name as string,
        address: (r.address as string) || undefined,
        city: (r.city as string) || undefined,
        state: (r.state as string) || undefined,
        country: (r.country as string) ?? "",
        phone: (r.phone as string) || undefined,
        lat: r.lat != null ? Number(r.lat) : undefined,
        lng: r.lng != null ? Number(r.lng) : undefined,
        professionals: [],
      });
    }
    const prof = r.professional_id
      ? {
          id: r.professional_id as string,
          name: r.professional_name as string,
          specialty: (r.specialty as string) || undefined,
          photoUrl: (r.photo_url as string) || undefined,
          inviteCode: (r.invite_code as string) || undefined,
        }
      : null;
    if (prof) {
      clinicMap.get(id)!.professionals.push(prof);
    }
  }

  const clinics = Array.from(clinicMap.values());

  return <DiscoverClient clinics={clinics} />;
}
