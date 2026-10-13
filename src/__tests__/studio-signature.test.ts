// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { PNG } from "pngjs";
import type { Design } from "@/lib/studio/design";

// Document Studio: the signature image (02, 10-13, option A). It appears
// ONLY on the patient's copy made when a document is issued; every
// on-demand render (a re-share after an edit, print, download) shows the
// typed stamp only, even with studio_signature_image on and an image saved.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const design = (): Design => ({ ...JSON.parse(readFileSync(join(FIX, "designs", "classic.json"), "utf8")), signature: { stamp: true, image: true, imagePath: "u1/signature.png" } });

function signaturePng(): Uint8Array {
  const png = new PNG({ width: 120, height: 40 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 60; png.data[i + 3] = (i / 4) % 7 === 0 ? 255 : 0; }
  return new Uint8Array(PNG.sync.write(png));
}
// How many images the PDF's first page draws.
async function imageCount(bytes: Uint8Array): Promise<number> {
  const page = (await PDFDocument.load(bytes)).getPage(0);
  const res = page.node.Resources();
  const xo = res?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xo ? xo.keys().length : 0;
}

describe("the renderer", () => {
  it("draws the image only when it's passed and the design turns it on", async () => {
    const { renderDesignedDocument } = await import("@/lib/pdf/designed");
    const { loadDesignFontBytes } = await import("@/lib/pdf/fonts");
    const { prescriptionContent } = await import("@/lib/studio/content");
    const d = design();
    const fonts = await loadDesignFontBytes(d.font, async (p) => read(p));
    const base = {
      locale: "pt-BR", practice: { displayName: "Dra. Helena Duarte", specialty: null, registrationLine: "CRM-SP 000000", clinicName: null, locations: [] },
      logos: { square: null, wide: null, reversed: null },
      doc: prescriptionContent({ title: "Receituário", patientLabel: "Paciente", patientName: "B", dateLabel: "Data", date: "12/10/2026", items: [{ name: "X", instructions: "y" }], notesLabel: "N", notes: null }),
    };
    expect(await imageCount(await renderDesignedDocument({ ...base, design: d, signatureImage: signaturePng() }, fonts))).toBe(1);
    expect(await imageCount(await renderDesignedDocument({ ...base, design: d }, fonts))).toBe(0);
    expect(await imageCount(await renderDesignedDocument({ ...base, design: { ...d, signature: { ...d.signature, image: false } }, signatureImage: signaturePng() }, fonts))).toBe(0);
  }, 60_000);
});

describe("on-demand renders never take a signature", () => {
  it("the print pages' browser render has no signature input", async () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "pdf", "browser.ts"), "utf8");
    expect(src).not.toMatch(/signature/i);
  });
});
