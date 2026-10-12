// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderPrescriptionPdf, type RxPdfInput } from "@/lib/pdf/prescription";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { DEFAULT_DESIGN, PALETTE_PRESETS, type Design } from "@/lib/studio/design";
import { resolveStyle, type DocStyle, type LegacyStyle } from "@/lib/studio/resolve";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR2 (the plumbing behind the layouts): a design's font,
// palette and texts reach the renderers; without a saved design the output
// is exactly today's (the baseline golden from PR1).

const read = (p: string) => readFile(join(process.cwd(), "public", p)).then((b) => new Uint8Array(b));
const LEGACY: LegacyStyle = { primaryColor: "#208AEF", accentColor: "#E8F4FE", headerText: null, footerText: null, brandColor: null };

// The baseline's prescription, drawn with a resolved style (as the callers will).
async function rx(style: DocStyle) {
  const input: RxPdfInput = {
    locale: "pt-BR",
    labels: { title: "Receita", patient: "Paciente", date: "Data", medications: "Medicamentos", medication: "Medicamento", dosage: "Dosagem", frequency: "Frequência", duration: "Duração", notes: "Observações", footer: "SolvyMed", corrected: "(corrigida)", unsignedCopy: "Cópia sem assinatura, para consulta do paciente." },
    template: { primaryColor: style.primaryColor, accentColor: style.accentColor, headerText: style.headerText, footerText: style.footerText, logoBytes: null },
    brand: null,
    patientName: "Ana Souza", patientAddress: "Rua A, 1, Fortaleza, CE", date: "07/10/2026", corrected: false,
    items: [
      { name: "Dipirona 500 mg", dosage: "1 comprimido", frequency: "6/6 h", duration: "3 dias" },
      { name: "Amoxicilina 500 mg", dosage: "1 cápsula", frequency: "8/8 h", duration: "7 dias" },
    ],
    notes: "Retorno em 30 dias.", signerName: "Dra. Vivian", signerRegistration: "CRM 19408/CE", forPatient: true,
    fontId: style.fontId,
  };
  return renderPrescriptionPdf(input, await loadDesignFontBytes(style.fontId, read));
}

const saved = (patch: Partial<Design>): Design => ({ ...structuredClone(DEFAULT_DESIGN), ...patch });

describe("resolveStyle", () => {
  it("no design, or one not saved yet: today's values, in Sarabun", () => {
    expect(resolveStyle(null, false, LEGACY, "prescription")).toEqual({ ...LEGACY, fontId: "sarabun" });
    const migrated = saved({ font: "trirong", palette: { ...PALETTE_PRESETS.navyGold, preset: "navyGold" }, texts: { prescription: { header: "x", footer: "y" } } });
    expect(resolveStyle(migrated, false, { ...LEGACY, brandColor: "#116E99" }, "prescription")).toEqual({ ...LEGACY, brandColor: "#116E99", fontId: "sarabun" });
  });

  it("a saved design: its font, palette (primary + light) and this type's texts; the brand block follows the palette", () => {
    const d = saved({ font: "prompt", palette: { ...PALETTE_PRESETS.sageSand, preset: "sageSand" }, texts: { prescription: { header: "Clínica Vivian", footer: "Seg–Sex 8h–18h" } } });
    expect(resolveStyle(d, true, { ...LEGACY, brandColor: "#116E99" }, "prescription")).toEqual({
      fontId: "prompt", primaryColor: "#7B917E", accentColor: "#F5F5F0", headerText: "Clínica Vivian", footerText: "Seg–Sex 8h–18h", brandColor: "#7B917E",
    });
    // Another type without its own texts: none (never the prescription's).
    expect(resolveStyle(d, true, LEGACY, "receipt")).toMatchObject({ headerText: null, footerText: null });
    // "system" in a saved design (not offered by the editor) still renders in Sarabun.
    expect(resolveStyle(saved({ font: "system" }), true, LEGACY, "prescription").fontId).toBe("sarabun");
  });
});

describe("the style reaches the PDF", () => {
  it("unsaved = today: the same pixels as PR1's baseline golden", async () => {
    const png = await renderPdfPage(await rx(resolveStyle(null, false, LEGACY, "prescription")));
    const { written, diffRatio } = compareGolden("baseline-prescription-pt", png);
    expect(written).toBe(false);
    expect(diffRatio).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);

  it.each([
    ["trirong", "sageSand"],
    ["prompt", "navyGold"],
  ] as const)("a saved design in %s / %s", async (font, preset) => {
    const d = saved({ font, palette: { ...PALETTE_PRESETS[preset], preset }, texts: { prescription: { header: null, footer: "Rua A, 1 · Fortaleza · (85) 3333-0000" } } });
    const png = await renderPdfPage(await rx(resolveStyle(d, true, LEGACY, "prescription")));
    const { written, diffRatio } = compareGolden(`style-rx-${font}-${preset}`, png);
    if (!written) expect(diffRatio).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);
});
