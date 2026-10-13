import type { SupabaseClient } from "@supabase/supabase-js";
import { conditionMet } from "@/lib/conditions";
import { assetUrl, type Brand } from "@/lib/brand";
import { withBrandTitle } from "@/lib/doctorName";
import { sortLocations, type PracticeLocation } from "@/lib/locations";
import { validateDesign, type Design, type DocType } from "./design";

// What a document needs to be drawn in the practice's saved design
// (Document Studio PR2, the wiring; server side): the design, the practice
// as the design shows it, and its logos (public brand-asset URLs). null =
// draw as today: Studio not live, no saved / valid design, a legal layout
// or a type a design doesn't style, or anything unreadable.

export type StudioDocData = {
  design: Design;
  practice: {
    displayName: string;
    specialty: string | null;
    registrationLine: string | null;
    clinicName: string | null;
    locations: { name: string; lines: string[] }[];
  };
  logos: { square: string | null; wide: string | null; reversed: string | null };
};

type DesignRow = { design?: unknown; saved?: unknown; assets?: { logoSquare?: string | null; logoWide?: string | null; logoReversed?: string | null } | null };

// Every location of the practice, primary first, as the footer prints them
// (its name, the address, the city and state; the phone is a contact).
export async function readStudioLocations(supabase: SupabaseClient, professionalId: string): Promise<{ name: string; lines: string[] }[]> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, address, city, state, phone, is_primary, position, created_at")
    .eq("professional_id", professionalId);
  if (error || !data) return [];
  return sortLocations(data as (PracticeLocation & { position?: number; created_at?: string })[]).map((l) => ({
    name: l.name,
    lines: [l.address?.trim(), [l.city?.trim(), l.state?.trim()].filter(Boolean).join(" · ")].filter((x): x is string => !!x),
  }));
}

export async function loadStudioForDocument(
  supabase: SupabaseClient,
  professionalId: string,
  type: () => Promise<DocType | null> | DocType | null,
  brand: Brand | null,
  profile: { fullName: string; specialty?: string | null; registration?: string | null; clinicName?: string | null },
): Promise<StudioDocData | null> {
  if (!conditionMet("document-studio-live")) return null;
  try {
    const { data, error } = await supabase.rpc("get_practice_design");
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as DesignRow | undefined;
    if (!row || row.saved !== true || !validateDesign(row.design).ok) return null;
    if (!(await type())) return null;
    const a = row.assets ?? {};
    const own = (url: string | null, ok: boolean | undefined) => (ok ? url : null);
    return {
      design: row.design as Design,
      practice: {
        displayName: withBrandTitle(brand?.title, brand?.displayName?.trim() || profile.fullName),
        specialty: brand?.specialty?.trim() || profile.specialty?.trim() || null,
        registrationLine: brand?.registrationLine?.trim() || profile.registration?.trim() || null,
        clinicName: profile.clinicName?.trim() || null,
        locations: await readStudioLocations(supabase, professionalId),
      },
      logos: {
        square: assetUrl(supabase, a.logoSquare) ?? own(brand?.logoSquareUrl ?? null, brand?.own.logo_square),
        wide: assetUrl(supabase, a.logoWide) ?? own(brand?.logoWideUrl ?? null, brand?.own.logo_wide),
        reversed: assetUrl(supabase, a.logoReversed),
      },
    };
  } catch {
    return null;
  }
}
