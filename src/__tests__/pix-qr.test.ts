import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { generatePixString, makePixQr, pixQrDataUrl, PIX_QR_MODULE_PX, PIX_QR_QUIET_MODULES } from "@/lib/pix";

// Renders the QR's module matrix to RGBA the way the GIF draws it (black on
// white, PIX_QR_MODULE_PX per module, the quiet zone around it), so jsQR can
// decode it without a canvas.
function render(pix: string) {
  const qr = makePixQr(pix);
  const n = qr.getModuleCount();
  const size = (n + 2 * PIX_QR_QUIET_MODULES) * PIX_QR_MODULE_PX;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < PIX_QR_MODULE_PX; y++) {
        for (let x = 0; x < PIX_QR_MODULE_PX; x++) {
          const px = (c + PIX_QR_QUIET_MODULES) * PIX_QR_MODULE_PX + x;
          const py = (r + PIX_QR_QUIET_MODULES) * PIX_QR_MODULE_PX + y;
          const i = (py * size + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe("Pix QR", () => {
  const cases = [
    generatePixString("dra.maria@example.com", "Clínica São João", "São Paulo", 150),
    generatePixString("+5511999998888", "Consultorio", "Rio de Janeiro"),
    generatePixString("123e4567-e89b-12d3-a456-426614174000", "Dr Very Long Clinic Name Here", "Belo Horizonte", 1234.56),
  ];

  it.each(cases)("decodes back to the exact BR Code", (pix) => {
    const { data, size } = render(pix);
    expect(jsQR(data, size, size)?.data).toBe(pix);
  });

  it("uses error correction M, >= 4 px modules and a 4-module quiet zone", () => {
    expect(PIX_QR_MODULE_PX).toBeGreaterThanOrEqual(4);
    expect(PIX_QR_QUIET_MODULES).toBe(4);
    const src = readFileSync("src/lib/pix.ts", "utf8");
    expect(src).toMatch(/qrcode\(0, "M"\)/);
  });

  it("is an image data URL built in the page", () => {
    expect(pixQrDataUrl(cases[0])).toMatch(/^data:image\/gif;base64,[A-Za-z0-9+/=]+$/);
  });

  it("never sends the payload to a third-party QR service", () => {
    expect(readFileSync("src/lib/pix.ts", "utf8")).not.toMatch(/https?:\/\//);
    const offenders = files("src").filter((f) => /\.(ts|tsx)$/.test(f) && /qrserver/i.test(readFileSync(f, "utf8")) && !f.endsWith("pix-qr.test.ts"));
    expect(offenders).toEqual([]);
  });
});
