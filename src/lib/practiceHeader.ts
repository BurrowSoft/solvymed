import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The practice's header for a printed document (the recibo, Help G5): the
// doctor's name, council registration and specialty, the clinic's name, CNPJ and address, and the
// clinic's document template. A secretary can't read the doctor's
// professionals row or templates (RLS), so the recibo lost its header when
// she printed it (8d, in the app). This reads ONLY those fields, with the
// server's key, for a practice the CALLER already proved they work for
// (the appointment was read as the user, under RLS, and belongs to it).

export type PracticeHeader = {
  fullName: string | null;
  // The council registration (e.g. "CRM 12345/SP"), when on file.
  registration: string | null;
  specialty: string | null;
  clinicName: string | null;
  clinicCnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  template: Record<string, unknown> | null;
};

export async function readPracticeHeader(professionalId: string, documentType: "invoice"): Promise<PracticeHeader> {
  const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [prof, template] = await Promise.all([
    db.from("professionals")
      .select("full_name, professional_registration, specialty, clinic_name, clinic_cnpj, clinic_address, clinic_city, clinic_state")
      .eq("id", professionalId)
      .maybeSingle(),
    db.from("document_templates")
      .select("primary_color, accent_color, logo_url, header_text, footer_text")
      .eq("professional_id", professionalId)
      .eq("document_type", documentType)
      .maybeSingle(),
  ]);
  const p = (prof.data ?? {}) as Record<string, string | null>;
  return {
    fullName: p.full_name ?? null,
    registration: p.professional_registration?.trim() || null,
    specialty: p.specialty ?? null,
    clinicName: p.clinic_name ?? null,
    clinicCnpj: p.clinic_cnpj ?? null,
    address: p.clinic_address ?? null,
    city: p.clinic_city ?? null,
    state: p.clinic_state ?? null,
    template: (template.data ?? null) as Record<string, unknown> | null,
  };
}
