// The reader is in São Paulo; the practice is in Bangkok (fa's row, #551).
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// A document's date in the list and its download's file name are the day it
// was issued on the PRACTICE's calendar, the same day the PDF prints (ec/fa
// on #551): created 03:05 on 14 Oct in Bangkok = 20:05 on 13 Oct here.

const h = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => Object.fromEntries([
  "createRecord", "deleteRecord", "updateRecord", "addRecordCorrection", "createPrescription", "deletePrescription", "updatePrescription",
  "addPrescriptionCorrection", "updatePatient", "deletePatient", "toggleBookingBlock", "generatePatientInviteCode", "getArchivePreview",
  "archivePatient", "restorePatient", "loadAccessLog", "mergeAvailable",
].map((n) => [n, vi.fn(async () => ({}))])));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => ({ listPatientFiles: vi.fn(async () => ({ ok: true, data: [] })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({ loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  createMedicalDocument: vi.fn(), updateMedicalDocument: vi.fn(), correctMedicalDocument: vi.fn(), deleteMedicalDocument: vi.fn(), documentPrintData: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments", async (orig) => ({
  ...(await orig<typeof import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments")>()),
  makeDocumentPdf: vi.fn(async () => ({ ok: true, bytes: new Uint8Array([1]), issued: "2026-10-14" })),
  downloadPdf: h.download,
}));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import type { MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";
import { formatShortDate } from "@/lib/dateLabels";

const T = pt.documents;
const CREATED = "2026-10-13T20:05:28Z";
const doc: MedDoc = { id: "d1", doc_type: "th_certificate", language: "th", fields: { examDate: "2026-10-14" }, body: "มีไข้", created_at: CREATED };

function open() {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={{ id: "pat", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" }} records={[]} prescriptions={[]} appointments={[]}
        locale="pt-BR" currentUserId="doc" timeZone="Asia/Bangkok" medicalDocs={{ list: [doc], country: "TH", hasPatientId: true }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: T.tabTitle.replace("{n}", "1") }));
}

describe("a document's day in the list and the download's name", () => {
  it("the reader's day here really is the 13th (the bug's condition)", () => {
    expect(new Date(CREATED).getDate()).toBe(13);
  });

  it("the card shows the practice's day, 14 Oct", () => {
    open();
    expect(screen.getByTestId("medical-doc-date")).toHaveTextContent(formatShortDate("pt-BR", "2026-10-14"));
  });

  it("the download is named with the day the PDF prints", async () => {
    open();
    fireEvent.click(within(screen.getByTestId("medical-doc")).getByRole("button", { name: T.download }));
    await waitFor(() => expect(h.download).toHaveBeenCalled());
    expect(h.download.mock.calls[0][1]).toBe(`${T.type.th_certificate} 2026-10-14.pdf`);
  });
});
