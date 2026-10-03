// Brand images are prepared in the browser before upload (1.5.0 design §1,
// sizes agreed with the app): from ONE logo upload, a square 512×512 and a
// wide 1200×400 version; the photo 800×800. A logo is fitted whole on a
// transparent background (never cropped: it's the doctor's mark); a photo
// is centre-cropped to fill. The server (the brand-asset function)
// re-encodes and stores; this only shapes and resizes.

export type BrandImageKind = "logo_square" | "logo_wide" | "photo";

export const BRAND_SIZES: Record<BrandImageKind, { w: number; h: number; fit: "contain" | "cover" }> = {
  logo_square: { w: 512, h: 512, fit: "contain" },
  logo_wide: { w: 1200, h: 400, fit: "contain" },
  photo: { w: 800, h: 800, fit: "cover" },
};

export const BRAND_INPUT_TYPES = ["image/png", "image/jpeg"];
// The limits e7's copy states (the server refuses more): 5 MB (the
// brand-staging bucket) and 4096 px per side.
export const BRAND_INPUT_MAX_BYTES = 5 * 1024 * 1024;
export const BRAND_INPUT_MAX_SIDE = 4096;

export class BrandImageTooLarge extends Error {}
export class BrandNotAnImage extends Error {}

export type Placement = { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };

// Where the source goes on the target canvas.
// contain: the whole source, scaled to fit, centred (no upscaling past 1×
// for small logos, so they don't blur). cover: fill the target, cropping
// the source's overflow equally on both sides.
export function placement(srcW: number, srcH: number, w: number, h: number, fit: "contain" | "cover"): Placement {
  if (fit === "contain") {
    const scale = Math.min(w / srcW, h / srcH, 1);
    const dw = Math.round(srcW * scale), dh = Math.round(srcH * scale);
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: Math.round((w - dw) / 2), dy: Math.round((h - dh) / 2), dw, dh };
  }
  const scale = Math.max(w / srcW, h / srcH);
  const sw = Math.round(w / scale), sh = Math.round(h / scale);
  return { sx: Math.round((srcW - sw) / 2), sy: Math.round((srcH - sh) / 2), sw, sh, dx: 0, dy: 0, dw: w, dh: h };
}

// Renders one version as a PNG (transparency kept). Browser only.
export async function renderBrandImage(file: Blob, kind: BrandImageKind): Promise<Blob> {
  const { w, h, fit } = BRAND_SIZES[kind];
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > BRAND_INPUT_MAX_SIDE || bitmap.height > BRAND_INPUT_MAX_SIDE) throw new BrandImageTooLarge(kind);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.imageSmoothingQuality = "high";
    const p = placement(bitmap.width, bitmap.height, w, h, fit);
    ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
    );
  } finally {
    bitmap.close();
  }
}
