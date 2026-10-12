// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderPrescriptionPdf } from "@/lib/pdf/prescription";
import { renderMedicalDocumentPdf } from "@/lib/pdf/medicalDocument";
import { compareGolden, GOLDEN_TOLERANCE, renderPdfPage } from "./helpers/golden";

// Document Studio PR1: TODAY's PDFs, frozen as goldens before the design
// renderer (PR2) touches them. A practice that never saved a design must
// keep printing exactly this (the brand.saved rule: documents don't change
// unasked); PR2's Classic + unsaved design is checked against these.

const fonts = {
  regular: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Regular.ttf"))),
  bold: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Bold.ttf"))),
};
const TEMPLATE = { primaryColor: "#208AEF", accentColor: "#E8F4FE", headerText: null, footerText: null, logoBytes: null };

describe("baseline goldens (today's look)", () => {
  it("the prescription shared with the patient (pt-BR)", async () => {
    const bytes = await renderPrescriptionPdf({
      locale: "pt-BR",
      labels: { title: "Receita", patient: "Paciente", date: "Data", medications: "Medicamentos", medication: "Medicamento", dosage: "Dosagem", frequency: "Frequência", duration: "Duração", notes: "Observações", footer: "SolvyMed", corrected: "(corrigida)", unsignedCopy: "Cópia sem assinatura, para consulta do paciente." },
      template: TEMPLATE, brand: null,
      patientName: "Ana Souza", patientAddress: "Rua A, 1, Fortaleza, CE", date: "07/10/2026", corrected: false,
      items: [
        { name: "Dipirona 500 mg", dosage: "1 comprimido", frequency: "6/6 h", duration: "3 dias" },
        { name: "Amoxicilina 500 mg", dosage: "1 cápsula", frequency: "8/8 h", duration: "7 dias" },
      ],
      notes: "Retorno em 30 dias.", signerName: "Dra. Vivian", signerRegistration: "CRM 19408/CE", forPatient: true,
    }, fonts);
    const { written, diffRatio } = compareGolden("baseline-prescription-pt", await renderPdfPage(bytes));
    if (!written) expect(diffRatio).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);

  it("a Thai medical certificate's sibling: the exam request in Thai", async () => {
    const bytes = await renderMedicalDocumentPdf({
      issued: "2026-10-07", city: "", place: "คลินิกสีลม", patientName: "สมหญิง ใจดี", patientId: { label: "เลขประจำตัวประชาชน", value: "1-1037-02071-73-1" },
      template: { primaryColor: "#208AEF", footerText: null, logoBytes: null }, brand: null,
      signerName: "พญ. วิไล", signerRegistration: "ใบอนุญาตประกอบวิชาชีพเวชกรรม เลขที่ ว.12345", footer: "SolvyMed", unsignedLine: null,
      type: "exam_request", lang: "th", fields: { exams: ["CBC", "ตรวจปัสสาวะ"], indication: "ไข้", cid: "R50" } as never, body: "",
    }, fonts);
    const { written, diffRatio } = compareGolden("baseline-exam-request-th", await renderPdfPage(bytes));
    if (!written) expect(diffRatio).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);

  it("a certificate in Portuguese", async () => {
    const bytes = await renderMedicalDocumentPdf({
      issued: "2026-10-07", city: "Fortaleza", place: "Clínica X", patientName: "Ana Souza", patientId: { label: "CPF", value: "123.456.789-09" },
      template: { primaryColor: "#208AEF", footerText: "Rua A, 1 · Fortaleza, CE · (85) 3333-0000", logoBytes: null }, brand: null,
      signerName: "Dra. Vivian", signerRegistration: "CRM 19408/CE", footer: "SolvyMed", unsignedLine: null,
      type: "certificate", lang: "pt-BR", fields: { variant: "absence", date: "2026-10-07", days: 3, start: "2026-10-08", includeCid: false } as never,
      body: "Atesto, para os devidos fins, que Ana Souza esteve sob meus cuidados em 7 de outubro de 2026 e necessita de 3 dia(s) de afastamento de suas atividades, a partir de 8 de outubro de 2026.",
    }, fonts);
    const { written, diffRatio } = compareGolden("baseline-certificate-pt", await renderPdfPage(bytes));
    if (!written) expect(diffRatio).toBeLessThan(GOLDEN_TOLERANCE);
  }, 60_000);
});
