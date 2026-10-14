import type { SupabaseClient } from "@supabase/supabase-js";
import { studioEnabled } from "./live";
import { signatureEnabled } from "./signature";
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
  // The design's texts for this document type (header / footer), or null.
  texts: { header: string | null; footer: string | null };
  // The signature image's path (private; the doctor's own signed URL reads
  // it): only when the design turns it on and studio_signature_image is on.
  // Used for the patient's copy made at issue time only (02).
  signaturePath: string | null;
};

export type DesignRow = { design?: unknown; saved?: unknown; assets?: { logoSquare?: string | null; logoWide?: string | null; logoReversed?: string | null } | null };

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
  if (!(await studioEnabled(supabase))) return null;
  try {
    const { data, error } = await supabase.rpc("get_practice_design");
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as DesignRow | undefined;
    if (!row || row.saved !== true || !validateDesign(row.design).ok) return null;
    const docType = await type();
    if (!docType) return null;
    const design = row.design as Design;
    const tx = design.texts[docType];
    return {
      design,
      practice: studioPractice(brand, profile, await readStudioLocations(supabase, professionalId)),
      logos: studioLogos(supabase, row.assets, brand),
      texts: { header: tx?.header?.trim() || null, footer: tx?.footer?.trim() || null },
      signaturePath: design.signature.image && design.signature.imagePath && (await signatureEnabled(supabase)) ? design.signature.imagePath : null,
    };
  } catch {
    return null;
  }
}

// The practice as a design shows it (My brand first, then the profile);
// shared with the Studio editor's preview.
export function studioPractice(
  brand: Brand | null,
  profile: { fullName: string; specialty?: string | null; registration?: string | null; clinicName?: string | null },
  locations: { name: string; lines: string[] }[],
): StudioDocData["practice"] {
  return {
    displayName: withBrandTitle(brand?.title, brand?.displayName?.trim() || profile.fullName),
    specialty: brand?.specialty?.trim() || profile.specialty?.trim() || null,
    registrationLine: brand?.registrationLine?.trim() || profile.registration?.trim() || null,
    clinicName: profile.clinicName?.trim() || null,
    locations,
  };
}

// The design's logos: its own assets (221), else the doctor's own My brand
// uploads (never a legacy image).
export function studioLogos(supabase: SupabaseClient, assets: DesignRow["assets"], brand: Brand | null): StudioDocData["logos"] {
  const a = assets ?? {};
  const own = (url: string | null, ok: boolean | undefined) => (ok ? url : null);
  return {
    square: assetUrl(supabase, a.logoSquare) ?? own(brand?.logoSquareUrl ?? null, brand?.own.logo_square),
    wide: assetUrl(supabase, a.logoWide) ?? own(brand?.logoWideUrl ?? null, brand?.own.logo_wide),
    reversed: assetUrl(supabase, a.logoReversed),
  };
}
