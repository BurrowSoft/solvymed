import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatePixString, pixQrDataUrl } from "@/lib/pix";

describe("pixQrDataUrl", () => {
  const pix = generatePixString("dra.maria@example.com", "Clínica São João", "São Paulo", 150);

  it("builds the QR in the page as an image data URL", () => {
    const url = pixQrDataUrl(pix);
    expect(url).toMatch(/^data:image\/gif;base64,[A-Za-z0-9+/=]+$/);
    expect(pixQrDataUrl(pix)).toBe(url);
  });

  it("never sends the Pix payload to a third-party QR service", () => {
    const src = readFileSync("src/lib/pix.ts", "utf8");
    expect(src).not.toMatch(/https?:\/\//);
    expect(pixQrDataUrl(pix)).not.toContain("dra.maria");
  });
});
