import { describe, expect, it } from "vitest";
import { BRAND_IMAGE_SHAPES, clampView, cropRect, initialView, isSmall, outputSize, zoomTo } from "@/lib/brandCrop";

// 1.8.0 G: the crop math (the app's shapes, d1): cover at zoom 1, never a
// gap, the rect in source pixels, downscale only, a warning under the minimum.

describe("brand image crop", () => {
  it("the shapes match the app's", () => {
    expect(BRAND_IMAGE_SHAPES.logo_wide).toEqual({ aspect: 3, outWidth: 1200, outHeight: 400, minSourceWidth: 450, format: "png" });
    expect(BRAND_IMAGE_SHAPES.photo.round).toBe(true);
    expect(BRAND_IMAGE_SHAPES.photo.format).toBe("jpeg");
  });

  it("zoom 1 covers the frame, centred; the rect is in source pixels", () => {
    const v = initialView(300, 100, 3000, 2000); // a 3:2 photo in a 3:1 frame
    const r = cropRect(v);
    expect(r.w).toBeCloseTo(3000);
    expect(r.h).toBeCloseTo(1000);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(500); // centred vertically
  });

  it("dragging never leaves a gap; zoom stays between 1 and 4", () => {
    const v = initialView(280, 280, 1000, 1000);
    expect(clampView({ ...v, x: 50, y: -5000 })).toMatchObject({ x: 0, y: 280 - 280 });
    expect(zoomTo(v, 10).zoom).toBe(4);
    expect(zoomTo(v, 0.1).zoom).toBe(1);
    // Zooming keeps the centre: a 2× crop of the middle.
    const r = cropRect(zoomTo(v, 2));
    expect(r.w).toBeCloseTo(500);
    expect(r.x).toBeCloseTo(250);
  });

  it("the output is downscaled to the shape, never upscaled; small crops warn", () => {
    const wide = BRAND_IMAGE_SHAPES.logo_wide;
    expect(outputSize({ x: 0, y: 0, w: 3000, h: 1000 }, wide)).toEqual({ w: 1200, h: 400 });
    expect(outputSize({ x: 0, y: 0, w: 600, h: 200 }, wide)).toEqual({ w: 600, h: 200 });
    expect(isSmall({ x: 0, y: 0, w: 449, h: 150 }, wide)).toBe(true);
    expect(isSmall({ x: 0, y: 0, w: 450, h: 150 }, wide)).toBe(false);
  });
});
