// The Receita de Controle Especial on the website (spec B.4; Anvisa's model,
// version 2, 16-03-2026): Portuguese only, fixed labels, PRINT only (never
// shared with the patient, no drawn signature, no QR, no "digital" wording).
// One A4 page per copy: "1ª via – Retenção pela Farmácia", then "2ª via –
// Paciente". The buyer block prints blank (cf); no back page (cf).
import { PDFDocument } from "pdf-lib";
import { FAINT, INK, MARGIN, Writer, hexColor, type FontBytes } from "./document";

export type ControlledPdfInput = {
  doctor: { name: string; crm: string; uf: string; address: string; city: string; cityUf: string; phone: string | null };
  patientName: string;
  // The CPF, else the passport number, else "não possui" (B.4): the value only.
  patientIdValue: string;
  items: { name: string; dose: string; quantity: string; posology: string }[];
  date: string; // dd/mm/aaaa
  template: { primaryColor: string; logoBytes: Uint8Array | null };
  brand: { logoBytes: Uint8Array | null; initials: string; color: string; name: string; specialty: string; registration: string } | null;
};

const L = {
  title: "RECEITA DE CONTROLE ESPECIAL",
  emitter: "IDENTIFICAÇÃO DO EMITENTE",
  fullName: "Nome completo",
  crm: "Nº inscrição CRM",
  uf: "UF",
  address: "Endereço completo",
  city: "Cidade",
  phone: "Telefone",
  patient: "IDENTIFICAÇÃO DO PACIENTE",
  patientId: "CPF ou, se estrangeiro, Passaporte nº",
  prescription: "PRESCRIÇÃO",
  date: "Data",
  signature: "Identificação e assinatura do prescritor",
  buyer: "IDENTIFICAÇÃO DO COMPRADOR",
  copies: ["1ª via – Retenção pela Farmácia", "2ª via – Paciente"] as const,
  note: "Válida apenas impressa e assinada à mão.",
};

const BLANK = "________________________________";

async function copy(input: ControlledPdfInput, fonts: FontBytes, which: 0 | 1): Promise<Uint8Array> {
  const color = hexColor(input.brand?.color ?? input.template.primaryColor);
  const w = await Writer.create({
    color, title: L.title, subtitle: "", centeredTitle: true,
    brand: input.brand, logoBytes: input.template.logoBytes,
    footer: `${L.copies[which]} · ${L.note}`,
    signerName: "", signerRegistration: null, unsignedLine: null, locale: "pt-BR",
  }, fonts);

  // A titled box around its lines.
  const box = (title: string, lines: string[]) => {
    w.need(30 + lines.length * 16);
    const top = w.y;
    w.gap(4);
    w.text(title, { size: 9, bold: true, color, x: MARGIN + 8 });
    for (const l of lines) w.text(l, { size: 10.5, x: MARGIN + 8, maxWidth: w.width - 16 });
    w.gap(8);
    w.page.drawRectangle({ x: MARGIN, y: w.y, width: w.width, height: top - w.y, borderColor: FAINT, borderWidth: 0.75 });
    w.gap(12);
  };

  const d = input.doctor;
  box(L.emitter, [
    `${L.fullName}: ${d.name}    ${L.crm}: ${d.crm}    ${L.uf}: ${d.uf}`,
    `${L.address}: ${d.address}    ${L.city}: ${d.city}    ${L.uf}: ${d.cityUf}`,
    ...(d.phone ? [`${L.phone}: ${d.phone}`] : []),
  ]);
  box(L.patient, [`${L.fullName}: ${input.patientName}`, `${L.patientId}: ${input.patientIdValue}`]);

  w.text(L.prescription, { size: 10, bold: true, color });
  w.gap(4);
  input.items.filter((i) => i.name.trim()).forEach((i, n) => {
    w.text(`${n + 1}. ${i.name}${i.dose ? ` — ${i.dose}` : ""}${i.quantity ? ` — ${i.quantity}` : ""}`, { size: 11, bold: true });
    if (i.posology.trim()) w.text(i.posology, { size: 10.5, x: MARGIN + 14 });
    w.gap(6);
  });

  w.gap(14);
  w.text(`${L.date}: ${input.date}`, { size: 11 });
  w.gap(18);
  w.text(`${L.signature}: ${BLANK}`, { size: 11 });
  w.gap(16);
  box(L.buyer, [
    `${L.fullName}: ${BLANK}${BLANK}`,
    `${L.patientId}: ${BLANK}`,
    `${L.address}: ${BLANK}${BLANK}`,
    `${L.city}: ${BLANK}  ${L.uf}: ____  ${L.phone}: ${BLANK}`,
  ]);
  w.gap(4);
  w.text(L.copies[which], { size: 11, bold: true, color: INK });
  return w.finish();
}

// Both copies in one file (printed twice, signed by hand).
export async function renderControlledPrescriptionPdf(input: ControlledPdfInput, fonts: FontBytes): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const which of [0, 1] as const) {
    const src = await PDFDocument.load(await copy(input, fonts, which));
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  out.setCreator("SolvyMed");
  out.setProducer("SolvyMed");
  return out.save();
}
