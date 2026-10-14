import type { DocBlock } from "@/lib/pdf/designed";
import { dateLine } from "@/lib/pdf/medicalDocument";
import {
  PRINT, fill, longDate, placeText, thCertWords,
  type CertificateFields, type DocLang, type ExamRequestFields, type MedicalDocType, type ThCertificateFields,
} from "@/lib/medicalDocuments";

// What a document says, as the designed renderer's blocks (Document Studio
// PR2): the same content, in the same order, as today's PDFs
// (lib/pdf/prescription, lib/pdf/medicalDocument). Only the look changes
// with a design, never the wording.

export function prescriptionContent(o: {
  title: string;
  patientLabel: string; patientName: string;
  dateLabel: string; date: string;
  items: { name: string; form?: string | null; instructions: string }[];
  notesLabel: string; notes: string | null;
  unsignedLine?: string | null;
}): { title: string; blocks: DocBlock[]; unsignedLine: string | null } {
  const blocks: DocBlock[] = [
    { kind: "fields", cells: [[o.patientLabel, o.patientName], [o.dateLabel, o.date]] },
    { kind: "items", items: o.items },
  ];
  if (o.notes?.trim()) blocks.push({ kind: "notes", label: o.notesLabel, text: o.notes.trim() });
  return { title: o.title, blocks, unsignedLine: o.unsignedLine ?? null };
}

const TITLE_KEY: Record<Exclude<MedicalDocType, "controlled_prescription">, keyof typeof PRINT.en.title> = {
  certificate: "certificate", th_certificate: "certificate", declaration: "declaration", exam_request: "exam_request",
};

// A certificate, declaration, exam request or the Thai medical certificate
// (the controlled prescription is a legal layout: never designed).
export function medicalDocumentContent(o: {
  type: Exclude<MedicalDocType, "controlled_prescription">;
  lang: DocLang;
  fields: CertificateFields | ExamRequestFields | ThCertificateFields | Record<string, unknown>;
  body: string;
  issued: string; city: string; place: string;
  patientName: string;
  patientId: { label: string; value: string } | null;
  signerName: string;
  licenceNo?: string | null;
  unsignedLine: string | null;
}): { title: string; blocks: DocBlock[]; unsignedLine: string | null } {
  const w = PRINT[o.lang];
  const title = w.title[TITLE_KEY[o.type]];
  const blocks: DocBlock[] = [];
  if (o.type === "th_certificate") {
    const t = o.fields as ThCertificateFields;
    const tw = thCertWords(o.lang);
    // No clinic name or address: a line to fill in (as the standard PDF).
    blocks.push({ kind: "fields", cells: [[tw.place, placeText(o.place)], ["", dateLine(o.lang, "", o.issued)]] });
    blocks.push({ kind: "paragraph", text: `${tw.iDoctor} ${o.signerName}${o.licenceNo?.trim() ? ` ${tw.licence} ${o.licenceNo.trim()}` : ""}` });
    blocks.push({ kind: "paragraph", text: `${tw.examined} ${o.patientName}${o.patientId ? ` ${o.patientId.label} ${o.patientId.value}` : ""}` });
    blocks.push({ kind: "paragraph", text: `${tw.on} ${longDate(o.lang, t.examDate)}` });
    blocks.push({ kind: "section", label: `${tw.findings}:` });
    blocks.push({ kind: "paragraph", text: o.body.trim() });
    if (t.rest) blocks.push({ kind: "checked", text: fill(tw.rest, { days: t.rest.days, start: longDate(o.lang, t.rest.start), end: longDate(o.lang, t.rest.end) }) });
    return { title, blocks, unsignedLine: o.unsignedLine };
  }
  const cells: [string, string][] = [[w.patient, o.patientName]];
  if (o.patientId) cells.push([o.patientId.label, o.patientId.value]);
  blocks.push({ kind: "fields", cells });
  if (o.type === "exam_request") {
    const f = o.fields as ExamRequestFields;
    blocks.push({ kind: "section", label: w.request });
    blocks.push({ kind: "bullets", items: (f.exams ?? []).map((x) => x.trim()).filter(Boolean) });
    if (f.indication?.trim()) blocks.push({ kind: "paragraph", text: `${w.indication}: ${f.indication.trim()}` });
    if (f.cid?.trim()) blocks.push({ kind: "paragraph", text: `${w.cid}: ${f.cid.trim()}` });
    if (o.body.trim()) blocks.push({ kind: "paragraph", text: o.body.trim(), muted: true });
  } else {
    blocks.push({ kind: "paragraph", text: o.body.trim() });
    const c = o.fields as CertificateFields;
    if (o.type === "certificate" && c.includeCid && c.cid?.trim()) blocks.push({ kind: "paragraph", text: `${w.cid}: ${c.cid.trim()}` });
  }
  blocks.push({ kind: "dateLine", text: dateLine(o.lang, o.city, o.issued) });
  return { title, blocks, unsignedLine: o.unsignedLine };
}
