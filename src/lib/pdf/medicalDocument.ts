// B's documents as PDFs on the website (spec B.0–B.3, B.5): the brand header,
// the title centred in capitals, the patient and their ID, the body (the
// doctor's text), the date line at the right in the document's own language,
// the signature area and the footer. The Thai medical certificate follows
// B.5's own lines. The same layouts as the app's. The controlled
// prescription has its own Anvisa layout (controlledPrescription.ts).
import { MUTED, Writer, hexColor, type FontBytes } from "./document";
import {
  PRINT, fill, longDate, thCertWords,
  type CertificateFields, type DocLang, type ExamRequestFields, type MedicalDocType, type ThCertificateFields,
} from "../medicalDocuments";

export type MedicalDocPdfInput = {
  type: Exclude<MedicalDocType, "controlled_prescription">;
  lang: DocLang;
  fields: CertificateFields | ExamRequestFields | ThCertificateFields | Record<string, unknown>;
  body: string;
  // The issue date (YYYY-MM-DD, the practice's day) and the city for the date line.
  issued: string;
  city: string;
  // The Thai certificate's "place of examination": the clinic's name and address.
  place: string;
  patientName: string;
  patientId: { label: string; value: string } | null;
  template: { primaryColor: string; footerText: string | null; logoBytes: Uint8Array | null };
  brand: { logoBytes: Uint8Array | null; initials: string; color: string; name: string; specialty: string; registration: string } | null;
  signerName: string;
  signerRegistration: string | null;
  footer: string;
  // 1.8.0 F: every practice location, above the footer (2+ locations).
  locationLines?: string[];
  // A copy shared with the patient (no drawn signature on the website).
  unsignedLine: string | null;
};

const TITLE_KEY: Record<MedicalDocPdfInput["type"], keyof typeof PRINT.en.title> = {
  certificate: "certificate",
  th_certificate: "certificate",
  declaration: "declaration",
  exam_request: "exam_request",
};

// "{city}, {date}" (Thai: "{city} วันที่ {date}"); without a city, the date alone.
export function dateLine(lang: DocLang, city: string, iso: string): string {
  const date = longDate(lang, iso);
  if (city.trim()) return fill(PRINT[lang].dateLine, { city: city.trim(), date });
  return lang === "th" ? `วันที่ ${date}` : date;
}

export async function renderMedicalDocumentPdf(input: MedicalDocPdfInput, fonts: FontBytes): Promise<Uint8Array> {
  const w = PRINT[input.lang];
  const writer = await Writer.create({
    color: hexColor(input.brand?.color ?? input.template.primaryColor),
    title: w.title[TITLE_KEY[input.type]],
    subtitle: "",
    centeredTitle: true,
    brand: input.brand,
    logoBytes: input.template.logoBytes,
    footer: input.template.footerText ?? input.footer,
    locationLines: input.locationLines,
    signerName: input.signerName,
    signerRegistration: input.signerRegistration,
    unsignedLine: input.unsignedLine,
    locale: input.lang,
  }, fonts);

  if (input.type === "th_certificate") {
    // B.5: place + date, "I {doctor}, licence no. …", "examined {patient}, ID …",
    // "on {exam date}", the findings, and the rest line when set.
    const t = input.fields as ThCertificateFields;
    const tw = thCertWords(input.lang);
    writer.text(`${tw.place}: ${input.place}`, { size: 11 });
    writer.aligned(dateLine(input.lang, "", input.issued), "right", { size: 11 });
    writer.gap(10);
    writer.text(`${tw.iDoctor} ${input.signerName}${input.signerRegistration ? ` ${tw.licence} ${input.signerRegistration}` : ""}`, { size: 11 });
    writer.text(`${tw.examined} ${input.patientName}${input.patientId ? ` ${input.patientId.label} ${input.patientId.value}` : ""}`, { size: 11 });
    writer.text(`${tw.on} ${longDate(input.lang, t.examDate)}`, { size: 11 });
    writer.gap(10);
    writer.text(`${tw.findings}:`, { size: 11, bold: true });
    writer.text(input.body.trim(), { size: 11, lineGap: 1.5 });
    if (t.rest) {
      writer.gap(10);
      writer.checked(fill(tw.rest, { days: t.rest.days, start: longDate(input.lang, t.rest.start), end: longDate(input.lang, t.rest.end) }), { size: 11 });
    }
    writer.signature();
    return writer.finish();
  }

  // The patient and their ID (no ID line when the patient has none).
  writer.text(`${w.patient}: ${input.patientName}`, { size: 11 });
  if (input.patientId) writer.text(`${input.patientId.label}: ${input.patientId.value}`, { size: 11 });
  writer.gap(16);

  if (input.type === "exam_request") {
    const f = input.fields as ExamRequestFields;
    writer.text(w.request, { size: 11, bold: true });
    writer.gap(4);
    for (const exam of (f.exams ?? []).map((x) => x.trim()).filter(Boolean)) writer.text(`• ${exam}`, { size: 11, x: 64 });
    if (f.indication?.trim()) {
      writer.gap(12);
      writer.text(`${w.indication}: ${f.indication.trim()}`, { size: 11 });
    }
    if (f.cid?.trim()) writer.text(`${w.cid}: ${f.cid.trim()}`, { size: 11 });
    if (input.body.trim()) {
      writer.gap(12);
      writer.text(input.body.trim(), { size: 11, color: MUTED });
    }
  } else {
    writer.text(input.body.trim(), { size: 11.5, lineGap: 1.5 });
    const c = input.fields as CertificateFields;
    if (input.type === "certificate" && c.includeCid && c.cid?.trim()) {
      writer.gap(8);
      writer.text(`${w.cid}: ${c.cid.trim()}`, { size: 11 });
    }
  }

  writer.gap(24);
  writer.aligned(dateLine(input.lang, input.city, input.issued), "right", { size: 11 });
  writer.signature();
  return writer.finish();
}
