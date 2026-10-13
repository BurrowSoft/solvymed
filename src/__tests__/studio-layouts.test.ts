// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { validateDesign } from "@/lib/studio/design";
import { LAYOUT_PRESETS, presetFor } from "@/lib/studio/layouts";
import { medicalDocumentContent, prescriptionContent } from "@/lib/studio/content";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR2: the four approved layouts (specs/studio-layouts),
// drawn from the shared fixtures (the same input as the app's renderer).
// Goldens are reviewed by eye against the mock-ups before committing; the
// band cases prove the footer ends above the band for every band style.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const sample = JSON.parse(readFileSync(join(FIX, "sample.json"), "utf8"));

// A stand-in logo (a ring), so the goldens need no image files.
function ring(hex: string): Uint8Array {
  const n = 144, png = new PNG({ width: n, height: n });
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - n / 2, y - n / 2);
    const on = Math.abs(d - 66) < 3 || (Math.abs(x - n / 2) < 22 && Math.abs(y - n / 2) < 3);
    const i = (y * n + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = on ? 255 : 0;
  }
  return new Uint8Array(PNG.sync.write(png));
}

async function render(design: Parameters<typeof renderDesignedDocument>[0]["design"]) {
  const pr = sample.practice, doc = sample.document;
  return renderDesignedDocument({
    design, locale: "pt-BR",
    practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
    logos: { square: ring(design.palette.primary), wide: null, reversed: ring("#F5F5F0") },
    doc: prescriptionContent({ title: doc.title, patientLabel: "Paciente", patientName: doc.patientName, dateLabel: "Data", date: "12/10/2026", items: doc.items, notesLabel: "Orientações", notes: doc.notes }),
  }, await loadDesignFontBytes(design.font, async (p) => read(p)));
}

describe("Studio layouts", () => {
  it("the presets: one per known layout; an unknown id draws Classic", () => {
    expect(Object.keys(LAYOUT_PRESETS).sort()).toEqual(["classic", "elegant", "minimal", "modern"]);
    expect(presetFor("watercolor").id).toBe("classic");
  });

  for (const f of readdirSync(join(FIX, "designs")).sort()) {
    const name = f.replace(".json", "");
    it(`${name}: a valid design, drawn as reviewed`, async () => {
      const design = JSON.parse(readFileSync(join(FIX, "designs", f), "utf8"));
      expect(validateDesign(design).ok).toBe(true);
      const png = await renderPdfPage(await render(design), 0, 1);
      const r = compareGolden(`studio-${name}`, png);
      expect(r.diffRatio).toBeLessThanOrEqual(GOLDEN_TOLERANCE);
    }, 60_000);
  }
});

// Every designable document type draws through the same blocks, with its
// own wording (lib/studio/content, the same as today's PDFs).
describe("Studio layouts: the other document types", () => {
  const designs = (name: string) => JSON.parse(readFileSync(join(FIX, "designs", `${name}.json`), "utf8"));
  const pr = sample.practice;
  const renderWith = async (design: ReturnType<typeof designs>, locale: string, doc: ReturnType<typeof medicalDocumentContent>) =>
    renderDesignedDocument({
      design, locale,
      practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
      logos: { square: ring(design.palette.primary), wide: null, reversed: ring("#F5F5F0") },
      doc,
    }, await loadDesignFontBytes(design.font, async (p) => read(p)));
  const base = { issued: "2026-10-12", city: "São Paulo", place: "Clínica Vida Plena", signerName: pr.displayName, unsignedLine: null };

  it.each([
    ["certificate-classic", "classic", "pt-BR", medicalDocumentContent({ ...base, type: "certificate", lang: "pt-BR", fields: { variant: "absence", date: "2026-10-12", days: 2, start: "2026-10-12", includeCid: true, cid: "J06.9" }, body: "Atesto, para os devidos fins, que Beatriz Almeida esteve sob meus cuidados nesta data e necessita de 2 (dois) dias de afastamento de suas atividades.", patientName: "Beatriz Almeida", patientId: { label: "CPF", value: "000.000.000-00" } })],
    ["exam-request-elegant", "elegant", "pt-BR", medicalDocumentContent({ ...base, type: "exam_request", lang: "pt-BR", fields: { exams: ["Hemograma completo", "Glicemia de jejum", "TSH"], indication: "Check-up anual", cid: "Z00.0" }, body: "", patientName: "Beatriz Almeida", patientId: null })],
    ["th-certificate-modern", "modern", "th", medicalDocumentContent({ ...base, type: "th_certificate", lang: "th", fields: { examDate: "2026-10-12", rest: { days: 2, start: "2026-10-12", end: "2026-10-13" } }, body: "มีไข้และเจ็บคอ ควรพักผ่อน", city: "", place: "คลินิกวิดาเปลนา", patientName: "สมหญิง ใจดี", patientId: { label: "เลขประจำตัวประชาชน", value: "1-2345-67890-12-3" }, licenceNo: "ว.12345", unsignedLine: "สำเนาไม่มีลายมือชื่อ สำหรับผู้ป่วยใช้อ้างอิง" })],
  ] as const)("%s", async (name, layout, locale, doc) => {
    const png = await renderPdfPage(await renderWith(designs(layout), locale, doc), 0, 1);
    expect(compareGolden(`studio-${name}`, png).diffRatio).toBeLessThanOrEqual(GOLDEN_TOLERANCE);
  }, 60_000);
});
