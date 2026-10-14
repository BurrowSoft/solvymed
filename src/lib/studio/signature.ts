import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND_STAGING_BUCKET, BRAND_STAGED_MAX_BYTES } from "@/lib/brand";

// Document Studio: the doctor's signature image (c5: brand-asset v9 +
// migrations 221/225). One switch, the server flag studio_signature_image
// (per-practice testers): while it's off no client shows the upload, the
// function refuses to publish (not_enabled) and save_my_design refuses
// signature.image = true. The image is PRIVATE (signature-assets/<uid>/
// signature.png, owner-read only): it's read with a short signed URL by the
// doctor alone (a secretary can't), and never goes on posters or
// letterheads (their renderers take no signature).

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> };

export const SIGNATURE_FLAG = "studio_signature_image";
export const SIGNATURE_BUCKET = "signature-assets";
const SIGNED_URL_TTL_S = 60;
const TYPES = ["image/png", "image/jpeg"];

export async function signatureEnabled(supabase: Rpc): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("get_server_flags");
    if (error) return false;
    return ((data ?? []) as { key?: string; enabled?: boolean }[]).some((f) => f.key === SIGNATURE_FLAG && f.enabled === true);
  } catch {
    return false;
  }
}

export class SignatureUploadError extends Error {
  constructor(public code: "not_an_image" | "too_large" | "not_enabled" | "failed") {
    super(code);
  }
}

// A PNG or JPEG (≤ 5 MB, brand-staging's limit) → the function checks the
// real type, orients, scales to 1200×400 and writes a metadata-free PNG.
// Returns the stored path for design.signature.imagePath.
export async function uploadSignature(supabase: SupabaseClient, uid: string, file: File): Promise<string> {
  if (!TYPES.includes(file.type)) throw new SignatureUploadError("not_an_image");
  if (file.size > BRAND_STAGED_MAX_BYTES) throw new SignatureUploadError("too_large");
  const ext = file.type === "image/png" ? "png" : "jpg";
  const stagingPath = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BRAND_STAGING_BUCKET).upload(stagingPath, file, { contentType: file.type, upsert: false });
  if (upErr) throw new SignatureUploadError("failed");
  const { data, error } = await supabase.functions.invoke("brand-asset", { body: { action: "publish", kind: "signature", staging_path: stagingPath } });
  if (error) {
    const code = await functionErrorCode(error);
    if (code === "not_an_image" || code === "too_large" || code === "not_enabled") throw new SignatureUploadError(code);
    throw new SignatureUploadError("failed");
  }
  if (typeof data?.path !== "string") throw new SignatureUploadError("failed");
  return data.path;
}

// Deletes the stored image (works with the flag off too). The design is
// saved first with image:false (c5: a design pointing at a missing file
// renders without it anyway).
export async function removeSignature(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.functions.invoke("brand-asset", { body: { action: "remove", kind: "signature" } });
  if (error) throw new Error("remove");
}

// The image's bytes for the doctor's own documents and the editor's
// preview: a 60-second signed URL, fetched at once, never stored or put in a
// document. null for anyone else (owner-read only) or on any failure.
export async function signatureBytes(supabase: SupabaseClient, path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl, { cache: "no-store" });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

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
