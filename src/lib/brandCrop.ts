// 1.8.0 G (Vitor, 7 Oct): crop brand images before upload, the same shapes
// as the app (d1's BRAND_IMAGE_SHAPES). The crop is computed in source
// pixels; the output is downscaled to out* when larger, never upscaled.
// A crop narrower than minSourceWidth gets a warning only ("may print
// blurry"), never a block.

import type { BrandImageKind } from "@/lib/brandImage";

export type BrandImageShape = { aspect: number; outWidth: number; outHeight: number; minSourceWidth: number; format: "png" | "jpeg"; round?: boolean };

export const BRAND_IMAGE_SHAPES: Record<BrandImageKind, BrandImageShape> = {
  logo_square: { aspect: 1, outWidth: 600, outHeight: 600, minSourceWidth: 200, format: "png" },
  logo_wide: { aspect: 3, outWidth: 1200, outHeight: 400, minSourceWidth: 450, format: "png" },
  photo: { aspect: 1, outWidth: 600, outHeight: 600, minSourceWidth: 200, format: "jpeg", round: true },
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export type CropView = { frameW: number; frameH: number; imgW: number; imgH: number; zoom: number; x: number; y: number };
export type CropRect = { x: number; y: number; w: number; h: number };

// The scale that makes the image cover the frame at zoom 1.
export function coverScale(v: Pick<CropView, "frameW" | "frameH" | "imgW" | "imgH">): number {
  return Math.max(v.frameW / v.imgW, v.frameH / v.imgH);
}

// Keeps the image covering the frame: x/y (the image's top-left in the
// frame) between frame − image size and 0.
export function clampView(v: CropView): CropView {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom));
  const s = coverScale(v) * zoom;
  const minX = v.frameW - v.imgW * s;
  const minY = v.frameH - v.imgH * s;
  return { ...v, zoom, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

// Zooms around the frame's centre (the slider / buttons / wheel).
export function zoomTo(v: CropView, zoom: number): CropView {
  const s0 = coverScale(v) * v.zoom;
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const s1 = coverScale(v) * z;
  const cx = (v.frameW / 2 - v.x) / s0;
  const cy = (v.frameH / 2 - v.y) / s0;
  return clampView({ ...v, zoom: z, x: v.frameW / 2 - cx * s1, y: v.frameH / 2 - cy * s1 });
}

// The view centred on the image at zoom 1.
export function initialView(frameW: number, frameH: number, imgW: number, imgH: number): CropView {
  const s = coverScale({ frameW, frameH, imgW, imgH });
  return { frameW, frameH, imgW, imgH, zoom: 1, x: (frameW - imgW * s) / 2, y: (frameH - imgH * s) / 2 };
}

// The crop in source pixels.
export function cropRect(v: CropView): CropRect {
  const s = coverScale(v) * v.zoom;
  return { x: -v.x / s, y: -v.y / s, w: v.frameW / s, h: v.frameH / s };
}

// The output size: the crop's own size, downscaled to the shape's at most.
export function outputSize(rect: CropRect, shape: BrandImageShape): { w: number; h: number } {
  const w = Math.max(1, Math.round(Math.min(shape.outWidth, rect.w)));
  return { w, h: Math.max(1, Math.round(w / shape.aspect)) };
}

export function isSmall(rect: CropRect, shape: BrandImageShape): boolean {
  return rect.w < shape.minSourceWidth;
}

// Draws the crop into a canvas and returns the file to upload.
export async function cropToFile(img: HTMLImageElement, rect: CropRect, shape: BrandImageShape, name: string): Promise<File> {
  const { w, h } = outputSize(rect, shape);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  if (shape.format === "jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  const type = shape.format === "png" ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, type, shape.format === "jpeg" ? 0.9 : undefined));
  if (!blob) throw new Error("no blob");
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${shape.format === "png" ? "png" : "jpg"}`, { type });
}
