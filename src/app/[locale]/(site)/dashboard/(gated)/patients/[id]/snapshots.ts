"use client";

import { loadFontBytes } from "@/lib/pdf/document";
import { renderPrescriptionPdf, type RxPdfLabels } from "@/lib/pdf/prescription";
import { shareSnapshot, type ShareOutcome } from "@/lib/shareSnapshot";
import { SNAPSHOT_FOLDER, sharesSnapshot, snapshotTitle, snapshotUnsignedLine } from "@/lib/medicalDocuments";
import { prescriptionSnapshotData } from "../snapshot-actions";
import { makeDocumentPdf, type MedDoc } from "./MedicalDocuments";

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
}): Promise<ShareOutcome | "accessLog"> {
  const r = await prescriptionSnapshotData(opts.patientId, opts.rxId);
  if (!r.ok) return r.code === "access_log_failed" ? "accessLog" : "failed";
  const d = r.data;
  try {
    const [fonts, logoBytes, brandLogo] = await Promise.all([loadFontBytes(), fetchBytes(d.template.logoUrl), fetchBytes(d.brand?.logoUrl ?? null)]);
    const bytes = await renderPrescriptionPdf({
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
  doctorId: string; patientId: string; doc: MedDoc; correctsId: string | null; footer: string;
}): Promise<ShareOutcome | "accessLog" | "notShared"> {
  const { doc } = opts;
  if (!sharesSnapshot(doc.doc_type)) return "notShared";
  try {
    const r = await makeDocumentPdf(opts.patientId, doc, { footer: opts.footer, unsignedCopy: snapshotUnsignedLine(doc.language) });
    if (!r.ok) return r.code === "access_log_failed" ? "accessLog" : "failed";
    return await shareSnapshot({
      doctorId: opts.doctorId, patientId: opts.patientId, bytes: r.bytes, source: "medical_document", sourceId: doc.id,
      replacesSourceId: opts.correctsId, folderKey: SNAPSHOT_FOLDER[doc.doc_type],
      title: snapshotTitle(doc.doc_type, doc.language, issuedDay(doc.created_at)),
    });
  } catch {
    return "failed";
  }
}

// The issue day as the PDF prints it (makeDocumentPdf: the local day).
function issuedDay(createdAt: string): string {
  const c = new Date(createdAt);
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
}
