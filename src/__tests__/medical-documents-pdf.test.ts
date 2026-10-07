// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderMedicalDocumentPdf, dateLine } from "@/lib/pdf/medicalDocument";
import { renderControlledPrescriptionPdf } from "@/lib/pdf/controlledPrescription";
import { renderPrescriptionPdf } from "@/lib/pdf/prescription";
import { documentTypesFor, fixedLanguage, longDate, prefilledBody, registrationLine, validateFields } from "@/lib/medicalDocuments";

// 1.8.0 B's model and the website's PDFs: the types per country (an explicit
// default, never "if Brazil"), the prefilled sentences in the document's
// language, the checks, and every layout producing a real PDF.

const fonts = {
  regular: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Regular.ttf"))),
  bold: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Bold.ttf"))),
};
const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 5)) === "%PDF-";

describe("the B model", () => {
  it("types per practice country, with an explicit default", () => {
    expect(documentTypesFor("BR")).toContain("controlled_prescription");
    expect(documentTypesFor("TH")).toEqual(["th_certificate", "declaration", "exam_request"]);
    expect(documentTypesFor("US")).toEqual(["certificate", "declaration", "exam_request"]);
    expect(documentTypesFor(null)).toEqual(["certificate", "declaration", "exam_request"]);
    expect(fixedLanguage("controlled_prescription")).toBe("pt-BR");
    expect(fixedLanguage("certificate")).toBeNull();
  });

  it("the prefilled sentence in the document's language; Thai dates in the Buddhist era", () => {
    const f = { variant: "absence" as const, date: "2026-10-07", days: 3, start: "2026-10-08", includeCid: false };
    expect(prefilledBody("certificate", f, "pt-BR", "Ana")).toBe("Atesto, para os devidos fins, que Ana esteve sob meus cuidados em 7 de outubro de 2026 e necessita de 3 dia(s) de afastamento de suas atividades, a partir de 8 de outubro de 2026.");
    expect(prefilledBody("certificate", f, "th", "สมหญิง")).toContain("7 ตุลาคม 2569");
    expect(prefilledBody("declaration", { date: "2026-10-07", from: "09:00", to: "10:00", companion: "João" }, "en", "Ana"))
      .toBe("I declare that Ana attended a medical appointment at this practice on 7 October 2026, from 09:00 to 10:00. Accompanied by João.");
    expect(longDate("de", "2026-10-07")).toBe("7. Oktober 2026");
    expect(dateLine("pt-BR", "Fortaleza", "2026-10-07")).toBe("Fortaleza, 7 de outubro de 2026");
    expect(dateLine("th", "", "2026-10-07")).toBe("วันที่ 7 ตุลาคม 2569");
    // French: "{city}, le {date}", and "Le {date}" with no city (cf, #413 row).
    expect(dateLine("fr", "Lyon", "2026-10-07")).toBe("Lyon, le 7 octobre 2026");
    expect(dateLine("fr", "", "2026-10-07")).toBe("Le 7 octobre 2026");
  });

  it("the registration line under the name: digits formatted per country, a letter as typed (cf, #413 row)", () => {
    expect(registrationLine("BR", "pt-BR", " 12345 ", "sp")).toBe("CRM 12345/SP");
    expect(registrationLine("BR", "en", "12345", null)).toBe("CRM 12345");
    expect(registrationLine("BR", "pt-BR", "CRM 12345/RJ", "SP")).toBe("CRM 12345/RJ");
    expect(registrationLine("TH", "th", "12345")).toBe("ใบอนุญาตประกอบวิชาชีพเวชกรรม เลขที่ ว.12345");
    expect(registrationLine("TH", "en", "12345")).toBe("Medical licence no. 12345");
    expect(registrationLine("TH", "th", "ว.12345")).toBe("ว.12345");
    expect(registrationLine("US", "en", "12345")).toBe("12345");
    expect(registrationLine("BR", "pt-BR", "  ")).toBeNull();
    expect(registrationLine("BR", "pt-BR", null)).toBeNull();
  });

  it("the checks before saving", () => {
    expect(validateFields("certificate", { variant: "absence", date: "2026-10-07", days: 0, start: "2026-10-07", includeCid: false }, "x")).toBe("days");
    expect(validateFields("certificate", { variant: "attendance", date: "2026-10-07", from: "10:00", to: "09:00", includeCid: false }, "x")).toBe("time");
    expect(validateFields("certificate", { variant: "attendance", date: "2026-10-07", from: "09:00", to: "10:00", includeCid: true, cid: "" }, "x")).toBe("cid");
    expect(validateFields("declaration", { date: "2026-10-07", from: "09:00", to: "10:00" }, " ")).toBe("body");
    expect(validateFields("exam_request", { exams: [" ", ""] }, "")).toBe("exams");
    expect(validateFields("exam_request", { exams: ["Hemograma"] }, "")).toBeNull();
    expect(validateFields("controlled_prescription", { items: [{ name: "", dose: "", quantity: "", posology: "" }] }, "")).toBe("items");
    expect(validateFields("th_certificate", { examDate: "2026-10-07", rest: { days: 2, start: "2026-10-08", end: "2026-10-07" } }, "x")).toBe("days");
  });
});

describe("the PDFs", () => {
  const base = {
    issued: "2026-10-07", city: "Fortaleza", place: "Clínica X", patientName: "Ana", patientId: { label: "CPF", value: "123" },
    template: { primaryColor: "#208AEF", footerText: null, logoBytes: null }, brand: null,
    signerName: "Dra. Vivian", signerRegistration: "CRM 1/CE", footer: "SolvyMed", unsignedLine: null,
  };

  it("each document type, in Portuguese and Thai", async () => {
    for (const [type, lang, fields, body] of [
      ["certificate", "pt-BR", { variant: "attendance", date: "2026-10-07", from: "09:00", to: "10:00", includeCid: true, cid: "F41" }, "Atesto…"],
      ["declaration", "en", { date: "2026-10-07", from: "09:00", to: "10:00" }, "I declare…"],
      ["exam_request", "th", { exams: ["CBC", "ตรวจปัสสาวะ"], indication: "ไข้", cid: "R50" }, ""],
      ["th_certificate", "th", { examDate: "2026-10-07", rest: { days: 2, start: "2026-10-07", end: "2026-10-08" } }, "มีไข้"],
    ] as const) {
      const bytes = await renderMedicalDocumentPdf({ ...base, type, lang, fields, body }, fonts);
      expect(isPdf(bytes), type).toBe(true);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    }
  });

  it("1.8.0 F: every location in the footer, still one page (Thai shaped too)", async () => {
    const locationLines = ["Unidade Centro · Rua A, 1, Fortaleza, CE · 85 3333-0000", "Unidade Sul · Rua B, 2, Fortaleza, CE", "สาขาสีลม · ถนนสีลม, กรุงเทพฯ", "Unidade Muito Longa · " + "Avenida Exemplo Comprida, 1234, Sala 567, ".repeat(4) + "Fortaleza, CE · 85 99999-0000"];
    const bytes = await renderMedicalDocumentPdf({ ...base, type: "declaration", lang: "pt-BR", fields: { date: "2026-10-07", from: "09:00", to: "10:00" }, body: "Declaro…", locationLines }, fonts);
    expect(isPdf(bytes)).toBe(true);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("the controlled prescription: two copies, one page each", async () => {
    const bytes = await renderControlledPrescriptionPdf({
      doctor: { name: "Vivian", crm: "19408", uf: "CE", address: "Rua A", city: "Fortaleza", cityUf: "CE", phone: null },
      patientName: "Ana", patientIdValue: "não possui",
      items: [{ name: "Clonazepam 2 mg", dose: "comprimido", quantity: "30", posology: "1 à noite" }],
      date: "07/10/2026", template: { primaryColor: "#208AEF", logoBytes: null }, brand: null,
    }, fonts);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("the prescription snapshot, with a long list spilling onto a second page", async () => {
    const bytes = await renderPrescriptionPdf({
      locale: "pt-BR",
      labels: { title: "Receita", patient: "Paciente", date: "Data", medications: "Medicamentos", medication: "Medicamento", dosage: "Dosagem", frequency: "Frequência", duration: "Duração", notes: "Observações", footer: "SolvyMed", corrected: "(corrigida)", unsignedCopy: "Cópia sem assinatura, para consulta do paciente." },
      template: { primaryColor: "#208AEF", accentColor: "#E8F4FE", headerText: null, footerText: null, logoBytes: null }, brand: null,
      patientName: "Ana", patientAddress: "", date: "07/10/2026", corrected: false,
      items: Array.from({ length: 20 }, (_, i) => ({ name: `Remédio ${i}`, dosage: "1 cp", frequency: "8/8 h", duration: "7 dias" })),
      notes: "Retorno em 30 dias.", signerName: "Vivian", signerRegistration: null, forPatient: true,
    }, fonts);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

describe("B follow-ups (53's row, cf 6 Oct)", () => {
  it("the language picker: the practice's language and English first, all 7 kept", async () => {
    const { docLangsFor } = await import("@/lib/medicalDocuments");
    expect(docLangsFor("BR")).toEqual(["pt-BR", "en", "th", "es", "de", "fr", "it"]);
    expect(docLangsFor("TH")).toEqual(["th", "en", "pt-BR", "es", "de", "fr", "it"]);
    expect(docLangsFor("US").slice(0, 1)).toEqual(["en"]);
    expect(docLangsFor(null)).toHaveLength(7);
  });

  it("the footer is in the document's language, for every language", async () => {
    const { PRINT, DOC_LANGS } = await import("@/lib/medicalDocuments");
    for (const l of DOC_LANGS) expect(PRINT[l].footer).toMatch(/^SolvyMed — /);
    expect(PRINT.th.footer).toBe("SolvyMed — ระบบบริหารคลินิก");
    expect(PRINT["pt-BR"].footer).toBe("SolvyMed — Gestão de clínicas");
  });

  it("a CPF prints formatted", async () => {
    const { formatCpfDigits } = await import("@/lib/medicalDocuments");
    expect(formatCpfDigits("12345678909")).toBe("123.456.789-09");
    expect(formatCpfDigits("123.456.789-09")).toBe("123.456.789-09");
    expect(formatCpfDigits("abc")).toBe("abc");
  });
});
