import type { DocBlock } from "@/lib/pdf/designed";
import { dateLine } from "@/lib/pdf/medicalDocument";
import {
  PRINT, fill, longDate, thCertWords,
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
}): { title: string; blocks: DocBlock[]; unsignedLine: string | null; runningHead: string } {
  const blocks: DocBlock[] = [
    { kind: "fields", cells: [[o.patientLabel, o.patientName], [o.dateLabel, o.date]] },
    { kind: "items", items: o.items },
  ];
  if (o.notes?.trim()) blocks.push({ kind: "notes", label: o.notesLabel, text: o.notes.trim() });
  return { title: o.title, blocks, unsignedLine: o.unsignedLine ?? null, runningHead: `${o.patientName} · ${o.date}` };
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
}): { title: string; blocks: DocBlock[]; unsignedLine: string | null; runningHead: string } {
  const w = PRINT[o.lang];
  const runningHead = `${o.patientName} · ${longDate(o.lang, o.issued)}`;
  const title = w.title[TITLE_KEY[o.type]];
  const blocks: DocBlock[] = [];
  if (o.type === "th_certificate") {
    const t = o.fields as ThCertificateFields;
    const tw = thCertWords(o.lang);
    blocks.push({ kind: "fields", cells: [[tw.place, o.place], ["", dateLine(o.lang, "", o.issued)]] });
    blocks.push({ kind: "paragraph", text: `${tw.iDoctor} ${o.signerName}${o.licenceNo?.trim() ? ` ${tw.licence} ${o.licenceNo.trim()}` : ""}` });
    blocks.push({ kind: "paragraph", text: `${tw.examined} ${o.patientName}${o.patientId ? ` ${o.patientId.label} ${o.patientId.value}` : ""}` });
    blocks.push({ kind: "paragraph", text: `${tw.on} ${longDate(o.lang, t.examDate)}` });
    blocks.push({ kind: "section", label: `${tw.findings}:` });
    blocks.push({ kind: "paragraph", text: o.body.trim() });
    if (t.rest) blocks.push({ kind: "checked", text: fill(tw.rest, { days: t.rest.days, start: longDate(o.lang, t.rest.start), end: longDate(o.lang, t.rest.end) }) });
    return { title, blocks, unsignedLine: o.unsignedLine, runningHead };
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
  return { title, blocks, unsignedLine: o.unsignedLine, runningHead };
}

// The patient's history (the print view's content, Help P8): the patient
// and their details, every record (date, time, corrected), every
// prescription (its medicines and notes), then who exported it and when.
export function historyContent(o: {
  title: string;
  patientName: string; detailLines: string[];
  recordsLabel: string; noRecords: string;
  records: { date: string; time: string; content: string; corrected: boolean }[];
  prescriptionsLabel: string; noPrescriptions: string;
  prescriptions: { date: string; corrected: boolean; notes: string | null; items: { name: string; dosage: string; frequency: string; duration: string }[] }[];
  corrected: string;
  exportedBy: string;
  // Today, in the practice's format (the running head on later pages).
  date: string;
}): { title: string; blocks: DocBlock[]; runningHead: string } {
  const blocks: DocBlock[] = [{ kind: "paragraph", text: o.patientName, bold: true }];
  if (o.detailLines.length) blocks.push({ kind: "paragraph", text: o.detailLines.join(" · "), muted: true });
  const stamp = (date: string, time: string, corrected: boolean) => [date, time].filter(Boolean).join(" ") + (corrected ? ` ${o.corrected}` : "");
  blocks.push({ kind: "section", label: `${o.recordsLabel} (${o.records.length})` });
  if (!o.records.length) blocks.push({ kind: "paragraph", text: o.noRecords, muted: true });
  for (const r of o.records) {
    blocks.push({ kind: "paragraph", text: stamp(r.date, r.time, r.corrected), muted: true });
    blocks.push({ kind: "paragraph", text: r.content });
  }
  blocks.push({ kind: "section", label: `${o.prescriptionsLabel} (${o.prescriptions.length})` });
  if (!o.prescriptions.length) blocks.push({ kind: "paragraph", text: o.noPrescriptions, muted: true });
  for (const rx of o.prescriptions) {
    blocks.push({ kind: "paragraph", text: stamp(rx.date, "", rx.corrected), muted: true });
    blocks.push({
      kind: "items",
      items: rx.items.map((m) => ({ name: m.name, form: m.dosage || null, instructions: [m.frequency, m.duration].filter((x) => x?.trim()).join(" · ") })),
    });
    if (rx.notes?.trim()) blocks.push({ kind: "paragraph", text: rx.notes.trim(), muted: true });
  }
  blocks.push({ kind: "paragraph", text: o.exportedBy, muted: true });
  return { title: o.title, blocks, runningHead: `${o.patientName} · ${o.date}` };
}

// The recibo (Brazil's simple receipt, Help G5; a Thai receipt is the legal
// one, never designed): who paid, its number and date, the clinic's
// registered name/CNPJ and address, the services with their amounts and the
// total, how it was paid, and the Receita Saúde note when it applies.
export function receiptContent(o: {
  title: string;
  patientLabel: string; patientName: string; idLines: string[];
  number: string; date: string;
  provider: string; clinic: string; address: string;
  servicesLabel: string;
  service: string; serviceDetail: string; amount: string;
  extras: { name: string; amount: string }[];
  totalLabel: string; total: string;
  paymentLabel: string; payment: string;
  note: string | null;
}): { title: string; blocks: DocBlock[]; runningHead: string } {
  const blocks: DocBlock[] = [{ kind: "fields", cells: [[o.patientLabel, o.patientName], [o.title, `#${o.number} · ${o.date}`]] }];
  if (o.idLines.length) blocks.push({ kind: "paragraph", text: o.idLines.join(" · "), muted: true });
  const who = [o.provider, o.clinic, o.address].filter((x) => x.trim());
  if (who.length) blocks.push({ kind: "paragraph", text: who.join("\n"), muted: true });
  blocks.push({ kind: "section", label: o.servicesLabel });
  blocks.push({
    kind: "rows",
    rows: [
      { label: o.service, detail: o.serviceDetail, value: o.amount },
      ...o.extras.map((x) => ({ label: x.name, value: x.amount })),
      { label: o.totalLabel, value: o.total, bold: true },
    ],
  });
  blocks.push({ kind: "paragraph", text: `${o.paymentLabel}: ${o.payment}` });
  if (o.note?.trim()) blocks.push({ kind: "paragraph", text: o.note.trim(), muted: true });
  return { title: o.title, blocks, runningHead: `${o.patientName} · #${o.number}` };
}

// The letterhead (02, 10-13): the design's page with an optional typed title
// and body, printed and never stored. The typed stamp only under a body;
// never a signature image, nor any patient data.
export function letterheadContent(o: { title: string; body: string }): { title: string; blocks: DocBlock[]; signature: "stamp" | "none" } {
  const body = o.body.trim();
  return { title: o.title.trim(), blocks: body ? [{ kind: "paragraph", text: body }] : [], signature: body ? "stamp" : "none" };
}
