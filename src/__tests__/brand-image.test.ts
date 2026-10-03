import { describe, expect, it } from "vitest";
import { BRAND_SIZES, placement } from "@/lib/brandImage";

// The agreed sizes (app + web) and how a source lands on each.
describe("brand image placement", () => {
  it("the agreed sizes: square 512, wide 1200×400, photo 800", () => {
    expect(BRAND_SIZES.logo_square).toMatchObject({ w: 512, h: 512, fit: "contain" });
    expect(BRAND_SIZES.logo_wide).toMatchObject({ w: 1200, h: 400, fit: "contain" });
    expect(BRAND_SIZES.photo).toMatchObject({ w: 800, h: 800, fit: "cover" });
  });

  it("a wide logo fits whole in the square, centred vertically", () => {
    const p = placement(2000, 500, 512, 512, "contain");
    expect(p).toMatchObject({ sx: 0, sy: 0, sw: 2000, sh: 500, dw: 512, dh: 128, dx: 0, dy: 192 });
  });

  it("a square logo fits whole in the wide version, centred horizontally", () => {
    const p = placement(1000, 1000, 1200, 400, "contain");
    expect(p).toMatchObject({ dw: 400, dh: 400, dx: 400, dy: 0 });
  });

  it("a small logo isn't upscaled (no blur)", () => {
    const p = placement(100, 50, 512, 512, "contain");
    expect(p).toMatchObject({ dw: 100, dh: 50, dx: 206, dy: 231 });
  });

  it("a portrait photo is centre-cropped to fill the square", () => {
    const p = placement(600, 900, 800, 800, "cover");
    expect(p).toMatchObject({ sx: 0, sy: 150, sw: 600, sh: 600, dx: 0, dy: 0, dw: 800, dh: 800 });
  });
});
