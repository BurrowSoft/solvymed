import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND_STAGING_BUCKET, functionErrorCode } from "@/lib/brand";

// The Patient Channel cover (246; 01's design, 10-27): a 3:1 banner on top of the
// channel page. The browser centre-crops it to 3:1 and re-encodes it as a JPEG
// (WebP too, like the app), it's staged in brand-staging, and the brand-asset
// function (kind pc_cover) checks it, fits it inside 2000×1200 and publishes it
// to the public pc-covers bucket. Public once saved (privacy PC-9, like the logo).

export const COVER_BUCKET = "pc-covers";
export const COVER_SIZE = { w: 1800, h: 600 };
export const COVER_INPUT_TYPES = ["image/png", "image/jpeg", "image/webp"];
// The limit the approved copy states ("no máximo 3 MB"); the function refuses more.
export const COVER_MAX_BYTES = 3 * 1024 * 1024;
export const COVER_MAX_SIDE = 4096;

export type CoverErrorCode = "too_large" | "bad_type" | "not_set_up" | "generic";
export class CoverError extends Error {
  constructor(public code: CoverErrorCode) {
    super(code);
  }
}

// The 3:1 centre crop, scaled down to at most 1800×600 (never up: a small
// picture stays sharp at its own size).
export function coverPlacement(srcW: number, srcH: number) {
  const crop = srcW / srcH > 3 ? { sw: Math.round(srcH * 3), sh: srcH } : { sw: srcW, sh: Math.round(srcW / 3) };
  const sx = Math.round((srcW - crop.sw) / 2);
  const sy = Math.round((srcH - crop.sh) / 2);
  const scale = Math.min(1, COVER_SIZE.w / crop.sw);
  return { sx, sy, sw: crop.sw, sh: crop.sh, w: Math.max(1, Math.round(crop.sw * scale)), h: Math.max(1, Math.round(crop.sh * scale)) };
}

// Checks the file and renders the banner as a JPEG on white. Browser only.
export async function renderCover(file: File): Promise<Blob> {
  if (!COVER_INPUT_TYPES.includes(file.type)) throw new CoverError("bad_type");
  if (file.size > COVER_MAX_BYTES) throw new CoverError("too_large");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new CoverError("bad_type");
  }
  try {
    if (bitmap.width > COVER_MAX_SIDE || bitmap.height > COVER_MAX_SIDE) throw new CoverError("too_large");
    const p = coverPlacement(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = p.w;
    canvas.height = p.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new CoverError("generic");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, p.w, p.h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, 0, 0, p.w, p.h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new CoverError("generic");
    if (blob.size > COVER_MAX_BYTES) throw new CoverError("too_large");
    return blob;
  } finally {
    bitmap.close();
  }
}

// Stages the rendered banner and publishes it. Returns the new pc-covers path.
export async function uploadCover(supabase: SupabaseClient, uid: string, blob: Blob): Promise<string> {
  const stagingPath = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from(BRAND_STAGING_BUCKET).upload(stagingPath, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new CoverError("generic");
  const { data, error } = await supabase.functions.invoke("brand-asset", { body: { action: "publish", kind: "pc_cover", staging_path: stagingPath } });
  if (error) throw new CoverError(coverErrorCode(await functionErrorCode(error)));
  if (!data?.path) throw new CoverError("generic");
  return data.path as string;
}

export async function removeCover(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.functions.invoke("brand-asset", { body: { action: "remove", kind: "pc_cover" } });
  if (error) throw new CoverError(coverErrorCode(await functionErrorCode(error)));
}

// brand-asset's refusals → the approved messages (403 not_a_practice_owner and
// 400 not_enabled can't happen from the UI, which hides the card then: generic).
export function coverErrorCode(code: string | null): CoverErrorCode {
  if (code === "too_large") return "too_large";
  if (code === "not_an_image") return "bad_type";
  if (code === "pc_not_set_up") return "not_set_up";
  return "generic";
}

export function coverUrl(supabase: Pick<SupabaseClient, "storage">, path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}
