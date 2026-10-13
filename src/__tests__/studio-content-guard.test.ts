// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { LAYOUTS, type Design } from "@/lib/studio/design";
import { medicalDocumentContent, prescriptionContent } from "@/lib/studio/content";
import { dateLine } from "@/lib/pdf/medicalDocument";
import { withLayout } from "@/lib/studio/starters";

// A design changes the look, never what a prescription says (02, ec: 78
// found Minimal dropping the strength, "· 10mg"). For every layout and
// every shared design fixture, the PDF's own text must contain every
// medication (name, form/strength, instructions), the notes, and every
// legal field: patient, date, the doctor's name, specialty and registration.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const sample = JSON.parse(readFileSync(join(FIX, "sample.json"), "utf8"));
const fixtures: [string, Design][] = readdirSync(join(FIX, "designs")).sort().map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(join(FIX, "designs", f), "utf8"))]);

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      out += tc.items.map((x) => ("str" in x ? x.str : "")).join("");
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
// Compared without spaces or case (a line break or a caps style changes neither).
const norm = (s: string) => s.replace(/\s+/g, "").toLocaleLowerCase("pt-BR");

// The shared fixture's items, plus ones whose form/strength appears nowhere
// else on the page (the dropped "10mg" case: the name and the instructions
// can't stand in for it).
const ITEMS: { name: string; form: string; instructions: string }[] = [
  ...sample.document.items,
  { name: "Losartana", form: "50 mg comprimido revestido", instructions: "Uso oral, uma vez ao dia, pela manhã." },
  { name: "Insulina NPH", form: "100 UI/mL", instructions: "Aplicar 12 unidades antes do café." },
];

async function render(design: Design) {
  const pr = sample.practice, doc = sample.document;
  return renderDesignedDocument({
    design, locale: "pt-BR",
    practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
    logos: { square: null, wide: null, reversed: null },
    doc: prescriptionContent({ title: doc.title, patientLabel: "Paciente", patientName: doc.patientName, dateLabel: "Data", date: "12/10/2026", items: ITEMS, notesLabel: "Orientações", notes: doc.notes }),
  }, await loadDesignFontBytes(design.font, async (p) => read(p)));
}

const cases: [string, Design][] = [
  ...fixtures,
  // Each known layout's own item style, from a fixture's choices.
  ...LAYOUTS.map((l) => [`layout ${l}`, { ...fixtures[0][1], layout: l }] as [string, Design]),
  // Each layout as the editor's pick sets it (its mock-up look).
  ...LAYOUTS.map((l) => [`starter ${l}`, withLayout(fixtures[0][1], l)] as [string, Design]),
];

describe("Studio: every medication and legal field appears in every layout", () => {
  for (const [name, design] of cases) {
    it(name, async () => {
      const text = norm(await pdfText(await render(design)));
      const doc = sample.document, pr = sample.practice;
      const must = [
        // The title and the field labels, in every layout (02: Minimal too).
        doc.title, "Paciente", "Data",
        doc.patientName, "12/10/2026", doc.notes,
        pr.displayName, pr.specialty, pr.registrationLine,
        ...ITEMS.flatMap((it) => [it.name, it.form, it.instructions]),
      ];
      for (const m of must) expect(text, `${name}: "${m}"`).toContain(norm(m));
    }, 60_000);
  }
});

// The medical documents (certificate, declaration, exam request, the Thai
// medical certificate) in every layout: the title, the patient and their
// ID, what the document says, the date line, and the doctor's identity.
type Med = Parameters<typeof medicalDocumentContent>[0];
const MED: { type: Med["type"]; lang: Med["lang"]; fields: Med["fields"]; body: string; texts: string[] }[] = [
  { type: "certificate", lang: "pt-BR", fields: { variant: "absence", date: "2026-10-12", days: 3, start: "2026-10-12", includeCid: true, cid: "J06.9" }, body: "Atesto que a paciente esteve sob meus cuidados e necessita de 3 dias de afastamento.", texts: ["J06.9"] },
  { type: "declaration", lang: "pt-BR", fields: {}, body: "Declaro que a paciente compareceu a esta clínica das 14h às 15h.", texts: [] },
  { type: "exam_request", lang: "pt-BR", fields: { exams: ["Hemograma completo", "TSH ultrassensível"], indication: "Investigação de fadiga", cid: "R53" }, body: "", texts: ["Hemograma completo", "TSH ultrassensível", "Investigação de fadiga", "R53"] },
  // Thai text comes out of the PDF as shaped glyphs: the English variant
  // of the same document checks the same fields.
  { type: "th_certificate", lang: "en", fields: { examDate: "2026-10-12", rest: { days: 2, start: "2026-10-12", end: "2026-10-13" } }, body: "Acute upper respiratory infection, no complications.", texts: [] },
];

describe("Studio: every medical document's title and legal fields appear in every layout", () => {
  for (const [name, design] of cases) {
    for (const m of MED) {
      it(`${m.type} · ${name}`, async () => {
        const pr = sample.practice;
        const content = medicalDocumentContent({
          type: m.type, lang: m.lang, fields: m.fields, body: m.body, issued: "2026-10-12", city: "São Paulo", place: "Clínica Vida Plena",
          patientName: "Beatriz Almeida", patientId: { label: "CPF", value: "123.456.789-09" },
          signerName: pr.displayName, licenceNo: pr.registrationLine, unsignedLine: null,
        });
        const bytes = await renderDesignedDocument({
          design, locale: m.lang,
          practice: { displayName: pr.displayName, specialty: pr.specialty, registrationLine: pr.registrationLine, clinicName: pr.clinicName, locations: pr.locations },
          logos: { square: null, wide: null, reversed: null },
          doc: content,
        }, await loadDesignFontBytes(design.font, async (p) => read(p)));
        const text = norm(await pdfText(bytes));
        const must = [content.title, "Beatriz Almeida", pr.displayName, pr.registrationLine, ...(m.body ? [m.body] : []), ...m.texts];
        if (m.type !== "th_certificate") must.push("123.456.789-09", dateLine(m.lang, "São Paulo", "2026-10-12"));
        for (const x of must) expect(text, `${m.type} · ${name}: "${x}"`).toContain(norm(x));
      }, 60_000);
    }
  }
});
