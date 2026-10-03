// The doctor's brand (1.5.0 "My brand"; 38's migration 161 + the
// brand-asset edge function). The table is never read directly: one RPC
// per audience (get_practice_brand for the owner, their secretaries and
// connected patients; get_public_brand_by_code for the public pages, from
// the browser only). Assets are object paths in the PUBLIC bucket
// brand-assets; the URL is built here. A legacy_* URL (the old profile
// photo / document logo) is used only when the matching path is unset.
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandImageTooLarge, BrandNotAnImage, renderBrandImage, type BrandImageKind } from "./brandImage";
import { brandInitials, isAccentHex, readableAccent } from "./readableAccent";
import { withBrandTitle } from "./doctorName";
import type { DocTemplate } from "./prescriptionDoc";

export const BRAND_BUCKET = "brand-assets";
export const BRAND_STAGING_BUCKET = "brand-staging";

// The save RPC's length caps (161).
export const BRAND_LIMITS = { displayName: 80, title: 20, specialty: 80, registrationLine: 80 } as const;

export type PracticeBrandRow = {
  professional_id: string;
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  registration_line: string | null;
  accent_color: string | null;
  logo_square_path: string | null;
  logo_wide_path: string | null;
  photo_path: string | null;
  legacy_photo_url: string | null;
  legacy_logo_url: string | null;
  // The doctor has saved My brand (migration 162, mobile #319; never null
  // there). Missing (before 162) = not saved.
  saved?: boolean | null;
};

export type Brand = {
  displayName: string;
  title: string;
  specialty: string;
  registrationLine: string;
  accentColor: string | null; // as stored; render with readableAccent
  logoSquareUrl: string | null;
  logoWideUrl: string | null;
  photoUrl: string | null;
  // Whether each asset is the doctor's own 1.5.0 upload (removable here)
  // rather than a legacy image.
  own: Record<BrandImageKind, boolean>;
  // My brand was saved (text or an image): only then do documents change.
  saved: boolean;
};

export function assetUrl(supabase: Pick<SupabaseClient, "storage">, path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BRAND_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function toBrand(supabase: Pick<SupabaseClient, "storage">, row: PracticeBrandRow | null | undefined): Brand {
  return {
    displayName: row?.display_name ?? "",
    title: row?.title ?? "",
    specialty: row?.specialty ?? "",
    registrationLine: row?.registration_line ?? "",
    accentColor: row?.accent_color ?? null,
    logoSquareUrl: assetUrl(supabase, row?.logo_square_path) ?? row?.legacy_logo_url ?? null,
    logoWideUrl: assetUrl(supabase, row?.logo_wide_path) ?? row?.legacy_logo_url ?? null,
    photoUrl: assetUrl(supabase, row?.photo_path) ?? row?.legacy_photo_url ?? null,
    own: { logo_square: !!row?.logo_square_path, logo_wide: !!row?.logo_wide_path, photo: !!row?.photo_path },
    saved: row?.saved === true,
  };
}

// The owner's (or a secretary's / connected patient's) view of a practice's
// brand. null when it can't be read (no row for this caller, 161 not
// applied yet, a network error): callers fall back to the defaults.
export async function loadPracticeBrand(supabase: SupabaseClient, professionalId: string): Promise<Brand | null> {
  const { data, error } = await supabase.rpc("get_practice_brand", { p_professional_id: professionalId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as PracticeBrandRow | undefined;
  return row ? toBrand(supabase, row) : null;
}

// What a public page shows (components/BrandHeader).
export type PublicBrand = {
  name: string; // title + display name, as shown
  specialty: string;
  accentColor: string | null;
  logoUrl: string | null;
  photoUrl: string | null;
};

// A practice brand (get_practice_brand) for a page patients see: only the
// doctor's own 1.5.0 images, never a legacy one (the old profile photos
// were never public; e7). null without a brand: the page stays as before.
export function publicFromPractice(b: Brand | null, fallback: { name: string; specialty: string }): PublicBrand | null {
  if (!b) return null;
  return {
    name: withBrandTitle(b.title, b.displayName || fallback.name),
    specialty: b.specialty.trim() || fallback.specialty,
    accentColor: b.accentColor,
    logoUrl: b.own.logo_square ? b.logoSquareUrl : null,
    photoUrl: b.own.photo ? b.photoUrl : null,
  };
}

// The brand on a printed document (prescription, history, receipt; 1.5.0,
// behind the flag), the same as the app's PDFs (#318, design §1):
// - only once the doctor SAVED My brand (e7): otherwise exactly as today;
// - the colour: the chosen accent made readable on white (it prints in
//   black and white too; e7 Q4); no accent: the template's colour as is;
// - the logo: the doctor's own wide logo, else the own square one, else the
//   template's logo;
// - a header block: that logo, else the initials in the colour, then the
//   title + display name, the specialty and the registration line (the RPC
//   falls back to the profile's own for empty fields).
// The signature stays the legal identity (full_name + registration; e7).
export type DocBrand = {
  logoUrl: string | null;
  initials: string;
  color: string;
  name: string;
  specialty: string;
  registration: string;
};

export function brandedDocTemplate(t: DocTemplate, b: Brand | null): DocTemplate {
  // e7: a doctor who has not saved My brand prints exactly as today.
  if (!b?.saved) return t;
  // A chosen accent, readable on white; no accent: the template's colour
  // exactly as it is (the same as the app's #318).
  const accent = isAccentHex(b.accentColor) ? readableAccent(b.accentColor, "#ffffff") : null;
  const logo = b.own.logo_wide ? b.logoWideUrl : b.own.logo_square ? b.logoSquareUrl : t.logoUrl;
  return { ...t, ...(accent ? { primaryColor: accent, accentColor: accent } : {}), logoUrl: logo };
}

export function docBrand(t: DocTemplate, b: Brand | null): DocBrand | null {
  if (!b?.saved) return null;
  const branded = brandedDocTemplate(t, b);
  const name = withBrandTitle(b.title, b.displayName);
  return {
    logoUrl: branded.logoUrl,
    initials: brandInitials(name),
    color: branded.primaryColor,
    name,
    specialty: b.specialty.trim(),
    registration: b.registrationLine.trim(),
  };
}

// The doctor's own saved values (the raw professional_brand row; owner RLS).
export type BrandFieldsRow = {
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  registration_line: string | null;
  accent_color: string | null;
};

export type BrandTextFields = { displayName: string; title: string; specialty: string; registrationLine: string; accentColor: string | null };

// Saves the text fields and the accent ('' clears a field: the RPC stores
// NULL and the practice's own name/specialty/registration show instead).
export async function saveMyBrand(supabase: SupabaseClient, f: BrandTextFields): Promise<{ ok: true } | { ok: false; code: string }> {
  const { error } = await supabase.rpc("save_my_brand", {
    p_display_name: f.displayName.trim(),
    p_title: f.title.trim(),
    p_specialty: f.specialty.trim(),
    p_registration_line: f.registrationLine.trim(),
    p_accent_color: f.accentColor ?? "",
  });
  return error ? { ok: false, code: error.message } : { ok: true };
}

// One image → staged in the private bucket → published by the function
// (validated, re-encoded, swapped in, the old object deleted). Returns the
// new public path.
// brand-staging's own limit (161); the rendered PNG is checked before upload.
export const BRAND_STAGED_MAX_BYTES = 5 * 1024 * 1024;

async function publishOne(supabase: SupabaseClient, uid: string, blob: Blob, kind: BrandImageKind): Promise<string> {
  if (blob.size > BRAND_STAGED_MAX_BYTES) throw new BrandImageTooLarge(kind);
  const stagingPath = `${uid}/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from(BRAND_STAGING_BUCKET).upload(stagingPath, blob, { contentType: "image/png", upsert: false });
  if (upErr) throw new Error("upload");
  const { data, error } = await supabase.functions.invoke("brand-asset", { body: { action: "publish", kind, staging_path: stagingPath } });
  if (error) {
    // The function's refusals (400 not_an_image / too_large) get their own
    // messages; anything else is the generic upload error.
    const code = await functionErrorCode(error);
    if (code === "too_large") throw new BrandImageTooLarge(kind);
    if (code === "not_an_image") throw new BrandNotAnImage(kind);
    throw new Error("publish");
  }
  if (!data?.path) throw new Error("publish");
  return data.path as string;
}

// The JSON error code of a non-2xx function reply ({ error: "too_large" }),
// when there is one.
async function functionErrorCode(error: unknown): Promise<string | null> {
  const res = (error as { context?: unknown })?.context;
  if (!(res instanceof Response)) return null;
  try {
    const body = (await res.clone().json()) as { error?: unknown; code?: unknown };
    const code = body?.error ?? body?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

// Each image is its own upload (e7: "Logo (quadrado)", "Logo horizontal
// (documentos)", "Foto"), shaped to its size first.
export async function uploadBrandImage(supabase: SupabaseClient, uid: string, file: File, kind: BrandImageKind): Promise<void> {
  const blob = await renderBrandImage(file, kind);
  await publishOne(supabase, uid, blob, kind);
}

export async function removeBrandImage(supabase: SupabaseClient, kind: BrandImageKind): Promise<void> {
  const { error } = await supabase.functions.invoke("brand-asset", { body: { action: "remove", kind } });
  if (error) throw new Error("remove");
}
