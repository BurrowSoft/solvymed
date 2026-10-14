// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { renderPoster, POSTER_SIZES, type PosterContent, type PosterFormat, type PosterInput } from "@/lib/pdf/poster";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { studioCountry, type Design } from "@/lib/studio/design";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR5: posters (02, 10-13). In every layout, template and
// format: the doctor's name and registration line always print (ad rules),
// the specialty only where the country allows, never anything else about a
// person; the booking QR encodes exactly the invite link; A3 is A4 scaled.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const designs: [string, Design][] = readdirSync(join(FIX, "designs")).sort().map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(join(FIX, "designs", f), "utf8"))]);
const INVITE = "https://www.solvymed.com/join/ABC123?c=BR";

const CONTENTS: PosterContent[] = [
  { kind: "hours", title: "Horário de atendimento", note: "Unidade Jardins às terças.", rows: [["Segunda", "08:00–18:00"], ["Terça", "08:00–18:00 · Unidade Jardins"], ["Sábado", "Fechado"]].map(([day, hours]) => ({ day, hours })) },
  { kind: "service", title: "Check-up anual", text: "Avaliação completa com exames de rotina.", price: null, note: null },
  { kind: "announcement", title: "Férias coletivas", text: "Fechado de 20/12 a 05/01." },
  { kind: "booking", title: "Agende sua consulta", qrUrl: INVITE, scanLabel: "Escaneie para agendar", linkText: "solvymed.com/join/ABC123?c=BR" },
];

function input(design: Design, content: PosterContent, format: PosterFormat, country = "BR"): PosterInput {
  return {
    design, locale: "pt-BR", content, format,
    practice: { displayName: "Dra. Helena Duarte", registrationLine: "CRM-SP 000000", clinicName: "Clínica Vida Plena", specialty: studioCountry(country).posterSpecialty ? "Clínica Geral" : null },
    contacts: ["(11) 0000-0000"], logos: { square: null, reversed: null },
  };
}
async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    const tc = await (await doc.getPage(1)).getTextContent();
    return tc.items.map((x) => ("str" in x ? x.str : "")).join("").replace(/\s+/g, "").toLocaleLowerCase("pt-BR");
  } finally {
    await doc.destroy();
  }
}
// Without spaces or case (a "spaced capitals" name style changes neither).
const n = (s: string) => s.replace(/\s+/g, "").toLocaleLowerCase("pt-BR");

describe("Studio posters", () => {
  for (const [name, design] of designs) {
    it(`${name}: every template and format names the doctor and the registration; no specialty in BR`, async () => {
      const fonts = await loadDesignFontBytes(design.font, async (p) => read(p));
      for (const content of CONTENTS) for (const format of ["a4", "post", "story"] as PosterFormat[]) {
        const text = await textOf(await renderPoster(input(design, content, format), fonts));
        for (const x of ["Dra. Helena Duarte", "CRM-SP 000000", content.title]) expect(text, `${content.kind}/${format}: ${x}`).toContain(n(x));
        expect(text, `${content.kind}/${format}: specialty in BR`).not.toContain(n("Clínica Geral ·"));
      }
    }, 120_000);
  }

  it("Thailand: the specialty may print with the licence", async () => {
    const d = designs[0][1];
    const text = await textOf(await renderPoster(input(d, CONTENTS[2], "a4", "TH"), await loadDesignFontBytes(d.font, async (p) => read(p))));
    expect(text).toContain(n("Clínica Geral · CRM-SP 000000"));
  }, 60_000);

  // Scanned from the image, at screen and print resolutions (modules drawn
  // one by one left hairline seams that broke decoding at 2× and 3×).
  it("the booking QR encodes exactly the invite link, in every format and resolution", async () => {
    const d = designs[0][1];
    const fonts = await loadDesignFontBytes(d.font, async (p) => read(p));
    for (const format of ["a4", "post", "story"] as PosterFormat[]) for (const scale of [1, 3]) {
      const png = PNG.sync.read(await renderPdfPage(await renderPoster(input(d, CONTENTS[3], format), fonts), 0, scale));
      expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, `${format} ×${scale}`).toBe(INVITE);
    }
  }, 120_000);

  it("sizes: A4, the social formats, and A3 (A4 scaled)", async () => {
    const d = designs[0][1];
    const fonts = await loadDesignFontBytes(d.font, async (p) => read(p));
    for (const f of ["a4", "post", "story"] as const) {
      const [p] = (await PDFDocument.load(await renderPoster(input(d, CONTENTS[2], f), fonts))).getPages();
      expect([Math.round(p.getWidth()), Math.round(p.getHeight())]).toEqual(POSTER_SIZES[f].map(Math.round));
    }
    const a3 = await PDFDocument.load(await renderPoster(input(d, CONTENTS[2], "a3"), fonts));
    expect(a3.getPageCount()).toBe(1);
    expect([Math.round(a3.getPage(0).getWidth()), Math.round(a3.getPage(0).getHeight())]).toEqual([842, 1191]);
  }, 60_000);

  for (const content of CONTENTS) {
    it(`golden: ${content.kind} (elegant, A4)`, async () => {
      const d = designs.find(([k]) => k === "elegant")![1];
      const png = await renderPdfPage(await renderPoster(input(d, content, "a4"), await loadDesignFontBytes(d.font, async (p) => read(p))), 0, 1);
      expect(compareGolden(`studio-poster-${content.kind}`, png).diffRatio).toBeLessThanOrEqual(GOLDEN_TOLERANCE);
    }, 60_000);
  }
});
