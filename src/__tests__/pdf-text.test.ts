// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawShaped, textWidth, wrapText } from "@/lib/pdf/text";

// The PDF text core: shaped glyph placement (Thai marks), widths and line
// breaks at word boundaries (Thai has no spaces).

async function doc() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Regular.ttf"))), { subset: true });
  return { pdf, font, page: pdf.addPage([595.28, 841.89]) };
}

describe("pdf text", () => {
  it("draws Thai, Portuguese and English into a valid PDF", async () => {
    const { pdf, font, page } = await doc();
    const w = drawShaped(page, "ปิ่น ที่ผู้ป่วย", { x: 40, y: 800, font, size: 14, color: rgb(0, 0, 0) });
    drawShaped(page, "Prescrição médica — Atenção", { x: 40, y: 780, font, size: 14, color: rgb(0, 0, 0) });
    expect(w).toBeCloseTo(textWidth(font, "ปิ่น ที่ผู้ป่วย", 14), 5);
    const bytes = await pdf.save();
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    // The font is a subset: far smaller than the 83 KB file.
    expect(bytes.length).toBeLessThan(40_000);
  });

  it("wraps at word boundaries, Thai included; keeps line breaks; cuts a too-long word", async () => {
    const { font } = await doc();
    const pt = wrapText("Tomar um comprimido de 8 em 8 horas durante sete dias", font, 12, 150, "pt-BR");
    expect(pt.length).toBeGreaterThan(1);
    for (const l of pt) expect(textWidth(font, l, 12)).toBeLessThanOrEqual(150);
    expect(pt.join(" ")).toBe("Tomar um comprimido de 8 em 8 horas durante sete dias");
    const th = wrapText("รับประทานยาครั้งละหนึ่งเม็ดหลังอาหารเช้ากลางวันและเย็น", font, 12, 120, "th");
    expect(th.length).toBeGreaterThan(1);
    expect(th.join("")).toBe("รับประทานยาครั้งละหนึ่งเม็ดหลังอาหารเช้ากลางวันและเย็น");
    expect(wrapText("a\nb", font, 12, 300)).toEqual(["a", "b"]);
    const long = wrapText("x".repeat(200), font, 12, 100);
    expect(long.length).toBeGreaterThan(1);
    expect(long.join("")).toBe("x".repeat(200));
  });
});
