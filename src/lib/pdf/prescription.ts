// The prescription as a PDF on the website (1.8.0 A: the snapshot shared
// with the patient), laid out as the app's buildPrescriptionHtml and the
// website's print view: patient (+ address), date, the medications table
// (the colour's header row, zebra rows in the accent's tint), the notes box,
// the signature area and the footer.
import { rgb } from "pdf-lib";
import { drawShaped, wrapText } from "./text";
import { FAINT, INK, LINE, MARGIN, MUTED, Writer, hexColor, tint, type FontBytes } from "./document";

export type RxPdfLabels = {
  title: string; patient: string; date: string; medications: string; medication: string;
  dosage: string; frequency: string; duration: string; notes: string; footer: string; corrected: string;
  unsignedCopy: string;
};

export type RxPdfInput = {
  labels: RxPdfLabels;
  locale: string;
  template: { primaryColor: string; accentColor: string; headerText: string | null; footerText: string | null; logoBytes: Uint8Array | null };
  brand: { logoBytes: Uint8Array | null; initials: string; color: string; name: string; specialty: string; registration: string } | null;
  patientName: string;
  patientAddress: string;
  date: string;
  corrected: boolean;
  items: { name: string; dosage: string; frequency: string; duration: string }[];
  notes: string | null;
  signerName: string;
  signerRegistration: string | null;
  // No drawn signature on the website: a copy for the patient says so (cf).
  forPatient: boolean;
};

const COLS = [0.34, 0.22, 0.22, 0.22];

export async function renderPrescriptionPdf(input: RxPdfInput, fonts: FontBytes): Promise<Uint8Array> {
  const { labels } = input;
  const color = hexColor(input.brand?.color ?? input.template.primaryColor);
  const accent = tint(hexColor(input.template.accentColor, "#E8F4FE"));
  const w = await Writer.create({
    color, title: labels.title, subtitle: input.template.headerText ?? input.patientName,
    brand: input.brand ? { logoBytes: input.brand.logoBytes, initials: input.brand.initials, name: input.brand.name, specialty: input.brand.specialty, registration: input.brand.registration } : null,
    logoBytes: input.template.logoBytes,
    footer: input.template.footerText ?? labels.footer,
    signerName: input.signerName, signerRegistration: input.signerRegistration,
    unsignedLine: input.forPatient ? labels.unsignedCopy : null,
    locale: input.locale,
  }, fonts);

  w.section(labels.patient, input.patientName, input.patientAddress || undefined);
  w.section(labels.date, input.corrected ? `${input.date} ${labels.corrected}` : input.date);

  // The medications table.
  w.need(60);
  w.text(labels.medications.toUpperCase(), { size: 8.5, color: FAINT });
  w.gap(6);
  const widths = COLS.map((c) => c * w.width);
  const pad = 7;
  const row = (cells: string[], o: { head?: boolean; fill?: ReturnType<typeof rgb> | null }) => {
    const size = o.head ? 8.5 : 10;
    const wrapped = cells.map((c, i) => wrapText(c, i === 0 || o.head ? w.fonts.bold : w.fonts.regular, size, widths[i] - 2 * pad, input.locale));
    const lh = size * 1.35;
    const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad;
    w.need(h);
    const top = w.y;
    if (o.fill) w.page.drawRectangle({ x: MARGIN, y: top - h, width: w.width, height: h, color: o.fill });
    let x = MARGIN;
    wrapped.forEach((lines, i) => {
      lines.forEach((l, j) => drawShaped(w.page, l, {
        x: x + pad, y: top - pad - (j + 1) * lh + size * 0.3,
        font: i === 0 || o.head ? w.fonts.bold : w.fonts.regular, size, color: o.head ? rgb(1, 1, 1) : INK,
      }));
      x += widths[i];
    });
    if (!o.head) w.page.drawLine({ start: { x: MARGIN, y: top - h }, end: { x: MARGIN + w.width, y: top - h }, thickness: 0.6, color: LINE });
    w.y = top - h;
  };
  row([labels.medication, labels.dosage, labels.frequency, labels.duration].map((s) => s.toUpperCase()), { head: true, fill: color });
  input.items.forEach((m, i) => row([m.name, m.dosage, m.frequency, m.duration], { fill: i % 2 === 1 ? accent : null }));
  w.gap(14);

  // The notes box: the accent's tint, a 3-pt bar in the colour.
  if (input.notes) {
    const text = `${labels.notes}: ${input.notes}`;
    const lines = wrapText(text, w.fonts.regular, 10, w.width - 28, input.locale);
    const lh = 13.5;
    const h = lines.length * lh + 16;
    w.need(h);
    const top = w.y;
    w.page.drawRectangle({ x: MARGIN, y: top - h, width: w.width, height: h, color: accent });
    w.page.drawRectangle({ x: MARGIN, y: top - h, width: 3, height: h, color });
    // The label in bold, then the text (the first line carries both).
    const labelText = `${labels.notes}:`;
    lines.forEach((l, j) => {
      const y = top - 8 - (j + 1) * lh + 3.5;
      if (j === 0 && l.startsWith(labelText)) {
        const lw = drawShaped(w.page, labelText, { x: MARGIN + 14, y, font: w.fonts.bold, size: 10, color: MUTED });
        drawShaped(w.page, l.slice(labelText.length), { x: MARGIN + 14 + lw, y, font: w.fonts.regular, size: 10, color: MUTED });
      } else {
        drawShaped(w.page, l, { x: MARGIN + 14, y, font: w.fonts.regular, size: 10, color: MUTED });
      }
    });
    w.y = top - h;
  }

  w.signature();
  return w.finish();
}
