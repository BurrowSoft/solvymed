import { describe, expect, it } from "vitest";
import vectors from "@/lib/readable-accent.vectors.json";
import { brandAccent, brandInitials, contrastRatio, DEFAULT_ACCENT, readableAccent } from "@/lib/readableAccent";

// The shared vectors (the app runs the same file through its own helper):
// both platforms must render a doctor's accent identically.
describe("readableAccent (shared vectors)", () => {
  it.each(vectors.vectors)("$hex on $bgName → $expected", ({ hex, bg, expected }) => {
    expect(readableAccent(hex, bg)).toBe(expected);
    expect(contrastRatio(expected, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("a passing colour is returned unchanged (lower-cased)", () => {
    expect(readableAccent("#116E99", "#ffffff")).toBe("#116e99");
  });
});

describe("brand defaults", () => {
  it("no or a malformed accent → the SolvyMed blue", () => {
    expect(brandAccent(null)).toBe(DEFAULT_ACCENT);
    expect(brandAccent("red")).toBe(DEFAULT_ACCENT);
    expect(brandAccent("#AB12CD")).toBe("#ab12cd");
  });

  it("initials skip a leading title", () => {
    expect(brandInitials("Dra. Ana Souza")).toBe("AS");
    expect(brandInitials("Dr Carlos")).toBe("C");
    expect(brandInitials("Prof. Maria Clara Lima")).toBe("ML");
    expect(brandInitials("นพ.สมชาย ใจดี")).toBe("สใ");
    expect(brandInitials("")).toBe("");
  });
});
