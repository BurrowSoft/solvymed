import { supabase } from './supabase';
import { Clinic, ClinicProfessional } from './types';

export type ProcedureSummary = {
  id: string;
  name: string;
  durationMinutes: number;
  price?: number;
  paymentType: string;
};

export async function searchClinics(query?: string): Promise<Clinic[]> {
  let q = supabase
    .from('clinics')
    .select('*')
    .order('name');

  if (query?.trim()) {
    q = q.or(`name.ilike.%${query}%,city.ilike.%${query}%,address.ilike.%${query}%`);
  }

  const { data, error } = await q.limit(50);
  if (error) throw error;
  return (data ?? []).map(toClinic);
}

export async function getClinicsByProfessional(professionalId: string): Promise<Clinic[]> {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('professional_id', professionalId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map(toClinic);
}

export async function getClinic(clinicId: string): Promise<Clinic | null> {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .maybeSingle();
  if (error) throw error;
  return data ? toClinic(data as Record<string, unknown>) : null;
}

export async function createClinic(
  professionalId: string,
  clinic: Omit<Clinic, 'id' | 'professionalId' | 'createdAt'>,
): Promise<Clinic> {
  const { data, error } = await supabase
    .from('clinics')
    .insert({
      professional_id: professionalId,
      name: clinic.name,
      address: clinic.address ?? null,
      city: clinic.city ?? null,
      state: clinic.state ?? null,
      country: clinic.country ?? 'BR',
      phone: clinic.phone ?? null,
      lat: clinic.lat ?? null,
      lng: clinic.lng ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  // Automatically add the creator as a member
  await supabase
    .from('clinic_professionals')
    .insert({ clinic_id: (data as Record<string, unknown>).id, professional_id: professionalId })
    .throwOnError();
  return toClinic(data as Record<string, unknown>);
}

export async function updateClinic(
  clinicId: string,
  updates: Partial<Omit<Clinic, 'id' | 'professionalId' | 'createdAt'>>,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.address !== undefined) mapped.address = updates.address ?? null;
  if (updates.city !== undefined) mapped.city = updates.city ?? null;
  if (updates.state !== undefined) mapped.state = updates.state ?? null;
  if (updates.phone !== undefined) mapped.phone = updates.phone ?? null;
  if (updates.lat !== undefined) mapped.lat = updates.lat ?? null;
  if (updates.lng !== undefined) mapped.lng = updates.lng ?? null;
  const { error } = await supabase.from('clinics').update(mapped).eq('id', clinicId);
  if (error) throw error;
}

export async function deleteClinic(clinicId: string): Promise<void> {
  const { error } = await supabase.from('clinics').delete().eq('id', clinicId);
  if (error) throw error;
}

export async function getClinicProfessionals(clinicId: string): Promise<ClinicProfessional[]> {
  const { data, error } = await supabase
    .from('clinic_professionals')
    .select('clinic_id, professional_id, professionals(full_name, specialty, photo_url, public_invite_code)')
    .eq('clinic_id', clinicId);
  if (error) throw error;
  return (data ?? []).map(row => {
    const r = row as Record<string, unknown>;
    const prof = (r.professionals ?? {}) as Record<string, unknown>;
    return {
      clinicId: r.clinic_id as string,
      professionalId: r.professional_id as string,
      professionalName: (prof.full_name as string) ?? '',
      specialty: (prof.specialty as string) || undefined,
      photoUrl: (prof.photo_url as string) || undefined,
      publicInviteCode: (prof.public_invite_code as string) || undefined,
    };
  });
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      { headers: { 'User-Agent': 'SolvyMed/1.0' } },
    );
    const json = await res.json() as Array<{ lat: string; lon: string }>;
    if (!json.length) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

export async function getProfessionalByPublicCode(
  code: string,
): Promise<{ professionalId: string; professionalName: string; specialty?: string } | null> {
  const { data } = await supabase.rpc('professional_by_invite_code', { code });
  if (!data?.length) return null;
  const row = data[0] as Record<string, unknown>;
  return {
    professionalId: row.professional_id as string,
    professionalName: row.professional_name as string,
    specialty: (row.professional_specialty as string) || undefined,
  };
}

export async function getProfessionalProcedures(professionalId: string): Promise<ProcedureSummary[]> {
  const { data, error } = await supabase.rpc('get_professional_procedures', {
    p_professional_id: professionalId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    durationMinutes: row.duration_minutes as number,
    price: row.price != null ? Number(row.price) : undefined,
    paymentType: row.payment_type as string,
  }));
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function toClinic(row: Record<string, unknown>): Clinic {
  return {
    id: row.id as string,
    professionalId: row.professional_id as string,
    name: row.name as string,
    address: (row.address as string) || undefined,
    city: (row.city as string) || undefined,
    state: (row.state as string) || undefined,
    country: (row.country as string) ?? 'BR',
    phone: (row.phone as string) || undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    createdAt: row.created_at as string,
  };
}
