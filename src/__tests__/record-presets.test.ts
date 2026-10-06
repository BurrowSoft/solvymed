import { describe, expect, it } from "vitest";
import { RECORD_PRESETS, composeRecordContent, presetLang, presetToTemplate } from "@/lib/recordPresets";

// 1.8.0 D: the specialty presets cf approved (8; Psiquiatria with "Medicações
// em uso" and "Avaliação de risco"), every title in pt-BR / en / th.

describe("record presets", () => {
  it("the 8 approved specialties", () => {
    expect(RECORD_PRESETS.map((p) => p.id)).toEqual(["psychiatry", "general", "cardiology", "psychology", "dentistry", "nutrition", "physiotherapy", "paediatrics"]);
  });

  it("every name, title and hint exists in pt-BR, en and th; within the template limits", () => {
    for (const p of RECORD_PRESETS) {
      for (const l of ["pt-BR", "en", "th"] as const) expect(p.name[l].trim()).not.toBe("");
      expect(p.sections.length).toBeGreaterThan(0);
      expect(p.sections.length).toBeLessThanOrEqual(30);
      for (const x of p.sections) {
        for (const l of ["pt-BR", "en", "th"] as const) {
          expect(x.title[l].trim().length).toBeGreaterThan(0);
          expect(x.title[l].length).toBeLessThanOrEqual(120);
          if (x.hint) expect(x.hint[l].length).toBeLessThanOrEqual(500);
        }
      }
    }
  });

  it("Psiquiatria: cf's list, in order", () => {
    expect(presetToTemplate(RECORD_PRESETS[0], "pt-BR").sections.map((x) => x.title)).toEqual([
      "Identificação", "Queixa principal", "HDA (história da doença atual)", "HPP (história patológica pregressa)",
      "História familiar", "Uso de substâncias", "Medicações em uso", "Exame do estado mental",
      "Avaliação de risco (suicídio / heteroagressividade)", "Hipótese diagnóstica (CID)", "Conduta",
    ]);
  });

  it("a copy follows the UI language; others fall back to English", () => {
    expect(presetToTemplate(RECORD_PRESETS[2], "th").name).toBe("อายุรศาสตร์โรคหัวใจ");
    expect(presetToTemplate(RECORD_PRESETS[2], "de").name).toBe("Cardiology");
    expect(presetLang("es")).toBe("en");
    expect(presetToTemplate(RECORD_PRESETS[0], "en").sections[7].hint).toMatch(/^Appearance/);
  });

  it("the composed text older clients read: titled blocks, empty sections left out", () => {
    expect(composeRecordContent([
      { title: "Queixa principal", text: " Insônia há 2 meses " },
      { title: "HDA", text: "  " },
      { title: "Conduta", text: "Retorno em 30 dias" },
    ])).toBe("Queixa principal:\nInsônia há 2 meses\n\nConduta:\nRetorno em 30 dias");
  });
});
