"use client";

import { loadDesignFontBytes } from "@/lib/pdf/fonts";
import { renderPrescriptionPdf, type RxPdfLabels } from "@/lib/pdf/prescription";
import { renderDesignedDocument } from "@/lib/pdf/designed";
import { prescriptionContent } from "@/lib/studio/content";
import { shareSnapshot, type ShareOutcome } from "@/lib/shareSnapshot";
import { SNAPSHOT_FOLDER, sharesSnapshot, snapshotImageCopyLine, snapshotTitle, snapshotUnsignedLine } from "@/lib/medicalDocuments";
import { prescriptionSnapshotData } from "../snapshot-actions";
import { makeDocumentPdf, type MedDoc } from "./MedicalDocuments";
import { createClient } from "@/lib/supabase/client";
import { signatureBytes } from "@/lib/studio/signature";

// 1.8.0 B2: the patient's copy of a prescription or a clinical document,
// made in the browser right after it's saved ("Compartilhar com o
// paciente", ON by default). The copy says it's unsigned (no drawn
// signature on the website). "accessLog": the PDF wasn't made, since its
// access couldn't be logged (the print views' rule).

async function fetchBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// A prescription: as its print view, in the doctor's UI language (as the
// app's), titled "<Receita> <date>". A correction replaces the copy of the
// prescription it corrects.
export async function shareRxSnapshot(opts: {
  doctorId: string; patientId: string; rxId: string; correctsId: string | null; locale: string;
  labels: RxPdfLabels; title: (iso: string) => string;
  // A new prescription or a correction (issued now): the patient's copy may
  // carry the signature image. An edit's re-share never does (02, 10-13).
  issued: boolean;
}): Promise<ShareOutcome | "accessLog"> {
  const r = await prescriptionSnapshotData(opts.patientId, opts.rxId);
  if (!r.ok) return r.code === "access_log_failed" ? "accessLog" : "failed";
  const d = r.data;
  try {
    // Document Studio: the prescription in the practice's saved design.
    if (d.studio) {
      const [studioFonts, square, wide, reversed, signatureImage] = await Promise.all([
        loadDesignFontBytes(d.studio.design.font), fetchBytes(d.studio.logos.square), fetchBytes(d.studio.logos.wide), fetchBytes(d.studio.logos.reversed),
        opts.issued ? signatureBytes(createClient(), d.studio.signaturePath) : Promise.resolve(null),
      ]);
      const L = opts.labels;
      const designed = await renderDesignedDocument({
        design: d.studio.design, locale: opts.locale, practice: d.studio.practice, logos: { square, wide, reversed }, signatureImage,
        doc: {
          ...prescriptionContent({
            title: L.title, patientLabel: L.patient, patientName: d.patientName, dateLabel: L.date, date: d.date,
            items: d.items.map((it) => ({ name: it.name, form: it.dosage || null, instructions: [it.frequency, it.duration].filter((x) => x?.trim()).join(" · ") })),
            notesLabel: L.notes, notes: d.notes, unsignedLine: L.unsignedCopy,
          }),
          headerText: d.studio.texts.header, footerText: d.studio.texts.footer,
          imageCopyLine: signatureImage ? L.imageCopy ?? null : null,
        },
      }, studioFonts);
      return await shareSnapshot({
        doctorId: opts.doctorId, patientId: opts.patientId, bytes: designed, source: "prescription", sourceId: opts.rxId,
        replacesSourceId: opts.correctsId, folderKey: "prescriptions", title: opts.title(d.iso),
      });
    }
    const [fonts, logoBytes, brandLogo] = await Promise.all([loadDesignFontBytes(d.fontId), fetchBytes(d.template.logoUrl), fetchBytes(d.brand?.logoUrl ?? null)]);
    const bytes = await renderPrescriptionPdf({
      fontId: d.fontId,
      labels: opts.labels, locale: opts.locale,
      template: { primaryColor: d.template.primaryColor, accentColor: d.template.accentColor, headerText: d.template.headerText, footerText: d.template.footerText, logoBytes },
      brand: d.brand ? { logoBytes: brandLogo, initials: d.brand.initials, color: d.brand.color, name: d.brand.name, specialty: d.brand.specialty, registration: d.brand.registration } : null,
      patientName: d.patientName, patientAddress: d.patientAddress, date: d.date, corrected: false,
      items: d.items, notes: d.notes, signerName: d.signerName, signerRegistration: d.signerRegistration, forPatient: true,
    }, fonts);
    return await shareSnapshot({
      doctorId: opts.doctorId, patientId: opts.patientId, bytes, source: "prescription", sourceId: opts.rxId,
      replacesSourceId: opts.correctsId, folderKey: "prescriptions", title: opts.title(d.iso),
    });
  } catch {
    return "failed";
  }
}

// A clinical document (not the controlled prescription, print-only): its
// own PDF in its own language, with the unsigned-copy line in that language,
// in its folder by type (ad), titled as printed + its date.
export async function shareDocumentSnapshot(opts: {
  doctorId: string; patientId: string; doc: MedDoc; correctsId: string | null; footer: string; demoFooter: string;
  // A new document or a correction (issued now): the copy may carry the
  // signature image; an edit's re-share never does (02).
  issued: boolean;
}): Promise<ShareOutcome | "accessLog" | "notShared"> {
  const { doc } = opts;
  if (!sharesSnapshot(doc.doc_type)) return "notShared";
  try {
    const r = await makeDocumentPdf(opts.patientId, doc, { footer: opts.footer, unsignedCopy: snapshotUnsignedLine(doc.language), imageCopy: snapshotImageCopyLine(doc.language), demoFooter: opts.demoFooter }, { withSignature: opts.issued });
    if (!r.ok) return r.code === "access_log_failed" ? "accessLog" : "failed";
    return await shareSnapshot({
      doctorId: opts.doctorId, patientId: opts.patientId, bytes: r.bytes, source: "medical_document", sourceId: doc.id,
      replacesSourceId: opts.correctsId, folderKey: SNAPSHOT_FOLDER[doc.doc_type],
      // The day the PDF prints (the practice's, makeDocumentPdf).
      title: snapshotTitle(doc.doc_type, doc.language, r.issued),
    });
  } catch {
    return "failed";
  }
}
