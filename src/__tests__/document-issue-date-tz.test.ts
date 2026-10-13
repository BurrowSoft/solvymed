// @vitest-environment node
// The reader's zone, set before any date is read: São Paulo, while the
// practice is in Bangkok (fa's row on #548 9441cf6f).
process.env.TZ = "America/Sao_Paulo";

import { afterEach, describe, expect, it, vi } from "vitest";

// A medical document's issue date is created_at's day in the PRACTICE's time
// zone, wherever the PDF is made (02; the practice-calendar rule). Created at
// 03:05 on 14 Oct in Bangkok = 20:05 on 13 Oct in São Paulo: the document
// says 14 Oct, as its own exam date. And with no clinic name or address, the
// Thai certificate's place is a line to fill in, not a bare label.

const h = vi.hoisted(() => ({ printData: vi.fn(), medical: vi.fn(), controlled: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  documentPrintData: h.printData, correctMedicalDocument: vi.fn(), createMedicalDocument: vi.fn(), updateMedicalDocument: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({ copySharedNow: vi.fn() }));
vi.mock("@/lib/pdf/document", async (orig) => ({ ...(await orig<typeof import("@/lib/pdf/document")>()), loadFontBytes: async () => ({ regular: new Uint8Array(), bold: new Uint8Array() }) }));
vi.mock("@/lib/pdf/medicalDocument", async (orig) => ({ ...(await orig<typeof import("@/lib/pdf/medicalDocument")>()), renderMedicalDocumentPdf: h.medical }));
vi.mock("@/lib/pdf/controlledPrescription", () => ({ renderControlledPrescriptionPdf: h.controlled }));

import { makeDocumentPdf, type MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";
import { PLACE_BLANK, placeText } from "@/lib/medicalDocuments";

const CREATED = "2026-10-13T20:05:28Z";
const data = (timeZone: string, clinic: { clinicName: string | null; address: string | null } = { clinicName: null, address: null }) => ({
  ok: true,
  data: {
    country: "TH", timeZone, idKind: "thai_id", locationLines: [],
    template: { primaryColor: "#208AEF", accentColor: "#E8F4FE", headerText: null, footerText: null, logoUrl: null },
    brand: null,
    doctor: { name: "Dr. A", registration: "12345", ...clinic, city: null, state: null, phone: null },
    patient: { name: "สมหญิง", cpf: null, thId: null, passport: null },
  },
});
const doc = (over: Partial<MedDoc> = {}): MedDoc => ({
  id: "d0c00000-0000-4000-8000-000000000001", doc_type: "th_certificate", language: "th",
  fields: { examDate: "2026-10-14" }, body: "มีไข้", created_at: CREATED, ...over,
});

afterEach(() => { h.printData.mockReset(); h.medical.mockReset(); h.controlled.mockReset(); });

describe("the issue date", () => {
  it("the reader's zone really is a day behind here (the bug's condition)", () => {
    expect(new Date(CREATED).getDate()).toBe(13);
  });

  it("a Bangkok practice's certificate, read in São Paulo, is dated 14 Oct (its own exam day)", async () => {
    h.printData.mockResolvedValue(data("Asia/Bangkok"));
    h.medical.mockResolvedValue(new Uint8Array([1]));
    const r = await makeDocumentPdf("p0000000-0000-4000-8000-000000000001", doc(), { footer: "", unsignedCopy: null });
    expect(r).toMatchObject({ ok: true, issued: "2026-10-14" });
    expect(h.medical.mock.calls[0][0].issued).toBe("2026-10-14");
  });

  it("a São Paulo practice's document keeps its own day (13 Oct)", async () => {
    h.printData.mockResolvedValue(data("America/Sao_Paulo"));
    h.medical.mockResolvedValue(new Uint8Array([1]));
    const r = await makeDocumentPdf("p0000000-0000-4000-8000-000000000001", doc({ doc_type: "declaration", language: "pt-BR", fields: { date: "2026-10-13", from: "", to: "" } }), { footer: "", unsignedCopy: null });
    expect(r).toMatchObject({ ok: true, issued: "2026-10-13" });
  });

  it("the controlled prescription's date too", async () => {
    h.printData.mockResolvedValue({ ...data("Asia/Bangkok"), data: { ...data("Asia/Bangkok").data, country: "BR", idKind: "cpf" } });
    h.controlled.mockResolvedValue(new Uint8Array([1]));
    const r = await makeDocumentPdf("p0000000-0000-4000-8000-000000000001", doc({ doc_type: "controlled_prescription", language: "pt-BR", fields: { items: [] } }), { footer: "", unsignedCopy: null });
    expect(r).toMatchObject({ ok: true, issued: "2026-10-14" });
    expect(h.controlled.mock.calls[0][0].date).toBe("14/10/2026");
  });
});

describe("the Thai certificate's place", () => {
  it("no clinic name or address: a line of 12 underscores to fill in", () => {
    expect(PLACE_BLANK).toBe("_".repeat(12));
    expect(placeText("")).toBe(PLACE_BLANK);
    expect(placeText("   ")).toBe(PLACE_BLANK);
    expect(placeText(null)).toBe(PLACE_BLANK);
    expect(placeText(" Clinic X ")).toBe("Clinic X");
  });

  it("the PDF draws the fill-in line after the label", async () => {
    const { renderMedicalDocumentPdf } = await vi.importActual<typeof import("@/lib/pdf/medicalDocument")>("@/lib/pdf/medicalDocument");
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonts = {
      regular: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Regular.ttf"))),
      bold: new Uint8Array(readFileSync(resolve("public/fonts/sarabun/Sarabun-Bold.ttf"))),
    };
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const text = async (place: string) => {
      const bytes = await renderMedicalDocumentPdf({
        type: "th_certificate", lang: "en", fields: { examDate: "2026-10-14" }, body: "Fever", issued: "2026-10-14", city: "", place,
        patientName: "Ana", patientId: null, template: { primaryColor: "#208AEF", footerText: null, logoBytes: null }, brand: null,
        signerName: "Dr. A", signerRegistration: null, footer: "SolvyMed", unsignedLine: null,
      }, fonts);
      const pdf = await getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(1);
      return (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("");
    };
    expect(await text("")).toContain(`Place of examination: ${PLACE_BLANK}`);
    expect(await text("Clinic X")).toContain("Place of examination: Clinic X");
  });
});
