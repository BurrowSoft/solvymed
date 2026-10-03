// The doctor's brand (1.5.0 "My brand"; 38's migration 161 + the
// brand-asset edge function). The table is never read directly: one RPC
// per audience (get_practice_brand for the owner, their secretaries and
// connected patients; get_public_brand_by_code for the public pages, from
// the browser only). Assets are object paths in the PUBLIC bucket
// brand-assets; the URL is built here. A legacy_* URL (the old profile
// photo / document logo) is used only when the matching path is unset.
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandImageTooLarge, BrandNotAnImage, renderBrandImage, type BrandImageKind } from "./brandImage";

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
  own: { logo: boolean; photo: boolean };
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
    own: { logo: !!(row?.logo_square_path || row?.logo_wide_path), photo: !!row?.photo_path },
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

// The logo: one upload, two versions (square + wide). The photo: one.
export async function uploadBrandImage(supabase: SupabaseClient, uid: string, file: File, what: "logo" | "photo"): Promise<void> {
  const kinds: BrandImageKind[] = what === "logo" ? ["logo_square", "logo_wide"] : ["photo"];
  for (const kind of kinds) {
    const blob = await renderBrandImage(file, kind);
    await publishOne(supabase, uid, blob, kind);
  }
}

export async function removeBrandImage(supabase: SupabaseClient, what: "logo" | "photo"): Promise<void> {
  const kinds: BrandImageKind[] = what === "logo" ? ["logo_square", "logo_wide"] : ["photo"];
  for (const kind of kinds) {
    const { error } = await supabase.functions.invoke("brand-asset", { body: { action: "remove", kind } });
    if (error) throw new Error("remove");
  }
}
