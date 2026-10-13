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
      doc: {
        ...prescriptionContent({ title: "Receituário", patientLabel: "Paciente", patientName: "B", dateLabel: "Data", date: "12/10/2026", items: [{ name: "X", instructions: "y" }], notesLabel: "N", notes: null, unsignedLine: "Cópia sem assinatura, para consulta do paciente." }),
        imageCopyLine: "Cópia para consulta do paciente. Sem assinatura digital.",
      },
    };
    expect(await imageCount(await renderDesignedDocument({ ...base, design: d, signatureImage: signaturePng() }, fonts))).toBe(1);
    expect(await imageCount(await renderDesignedDocument({ ...base, design: d }, fonts))).toBe(0);
    expect(await imageCount(await renderDesignedDocument({ ...base, design: { ...d, signature: { ...d.signature, image: false } }, signatureImage: signaturePng() }, fonts))).toBe(0);
  }, 60_000);

  // 02: the image never appears without "… Sem assinatura digital.", which
  // then replaces "Cópia sem assinatura…" (that line stays for every copy
  // without the image).
  it("the image only with its copy line, which replaces the unsigned line", async () => {
    const { renderDesignedDocument } = await import("@/lib/pdf/designed");
    const { loadDesignFontBytes } = await import("@/lib/pdf/fonts");
    const { prescriptionContent } = await import("@/lib/studio/content");
    const d = design();
    const fonts = await loadDesignFontBytes(d.font, async (p) => read(p));
    const doc = prescriptionContent({ title: "Receituário", patientLabel: "Paciente", patientName: "B", dateLabel: "Data", date: "12/10/2026", items: [{ name: "X", instructions: "y" }], notesLabel: "N", notes: null, unsignedLine: "Cópia sem assinatura, para consulta do paciente." });
    const base = { design: d, locale: "pt-BR", practice: { displayName: "Dra. Helena Duarte", specialty: null, registrationLine: "CRM-SP 000000", clinicName: null, locations: [] }, logos: { square: null, wide: null, reversed: null }, signatureImage: signaturePng() };
    // No copy line: no image, the unsigned line as before.
    const without = await renderDesignedDocument({ ...base, doc }, fonts);
    expect(await imageCount(without)).toBe(0);
    expect(await textOf(without)).toContain(n("Cópia sem assinatura"));
    // With it: the image and its line, never the unsigned one.
    const withLine = await renderDesignedDocument({ ...base, doc: { ...doc, imageCopyLine: "Cópia para consulta do paciente. Sem assinatura digital." } }, fonts);
    expect(await imageCount(withLine)).toBe(1);
    expect(await textOf(withLine)).toContain(n("Sem assinatura digital."));
    expect(await textOf(withLine)).not.toContain(n("Cópia sem assinatura"));
  }, 60_000);
});

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    const tc = await (await doc.getPage(1)).getTextContent();
    return n(tc.items.map((x) => ("str" in x ? x.str : "")).join(""));
  } finally {
    await doc.destroy();
  }
}
function n(s: string) { return s.replace(/\s+/g, "").toLocaleLowerCase("pt-BR"); }

describe("on-demand renders never take a signature", () => {
  it("the print pages' browser render has no signature input", async () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "pdf", "browser.ts"), "utf8");
    expect(src).not.toMatch(/signature/i);
  });
});
