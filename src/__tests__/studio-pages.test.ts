// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import type { Design } from "@/lib/studio/design";
import { prescriptionContent } from "@/lib/studio/content";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR4: a document longer than a page (a long prescription,
// a patient's history) continues on a new page: the same paper, watermark
// and band, the footer on every page, the signature once, on the last page,
// never cut by the footer.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const sample = JSON.parse(readFileSync(join(FIX, "sample.json"), "utf8"));
const design = (name: string): Design => JSON.parse(readFileSync(join(FIX, "designs", `${name}.json`), "utf8"));

async function longRx(d: Design, signature?: "none") {
  const pr = sample.practice;
  const items = Array.from({ length: 16 }, (_, i) => ({
    name: `Medicamento ${i + 1} 500 mg`, form: "comprimido",
    instructions: "Tomar 1 comprimido de 8 em 8 horas, por 7 dias, depois das refeições, com um copo de água.",
  }));
  return renderDesignedDocument({
    design: d, locale: "pt-BR",
    practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
    logos: { square: null, wide: null, reversed: null },
    doc: {
      ...prescriptionContent({ title: "Receituário", patientLabel: "Paciente", patientName: "Beatriz Almeida", dateLabel: "Data", date: "12/10/2026", items, notesLabel: "Orientações", notes: "Retornar em 15 dias." }),
      signature,
    },
  }, await loadDesignFontBytes(d.font, async (p) => read(p)));
}

describe("Studio: documents longer than a page", () => {
  for (const name of ["classic", "band-twoTone-3col"]) {
    it(`${name}: continues on page 2 with the footer on both pages and the signature on the last`, async () => {
      const bytes = await longRx(design(name));
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
      for (const i of [0, 1]) {
        const png = await renderPdfPage(bytes, i, 1);
        expect(compareGolden(`studio-pages-${name}-${i + 1}`, png).diffRatio).toBeLessThanOrEqual(GOLDEN_TOLERANCE);
      }
    }, 60_000);
  }

  it("a short document stays on one page", async () => {
    const d = design("classic");
    const pr = sample.practice, doc = sample.document;
    const bytes = await renderDesignedDocument({
      design: d, locale: "pt-BR",
      practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
      logos: { square: null, wide: null, reversed: null },
      doc: prescriptionContent({ title: doc.title, patientLabel: "Paciente", patientName: doc.patientName, dateLabel: "Data", date: "12/10/2026", items: doc.items, notesLabel: "Orientações", notes: doc.notes }),
    }, await loadDesignFontBytes(d.font, async (p) => read(p)));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  }, 60_000);
});
