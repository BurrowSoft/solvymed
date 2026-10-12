import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { copyIsShared, type PatientDocument } from "@/lib/patientDocuments";

// 1.9.0 (02, the app's rule; 78): editing or correcting a prescription or a
// document with a patient copy, "Share with the patient" starts as that
// copy is NOW: an unchanged Save with the box on re-exposed a copy the
// doctor had hidden. A new one stays ON; the doctor's own click wins.

const copy = (o: Partial<PatientDocument>): PatientDocument => ({
  id: "c1", folderId: "f", title: "Receita", mime: "application/pdf", sizeBytes: 1, source: "prescription",
  prescriptionId: null, medicalDocumentId: null, replacesId: null, replaced: false, shared: true,
  uploadedByRole: "professional", doctorOpenedAt: null, createdAt: "2026-10-01T00:00:00Z", storagePath: "p", hidden: null, ...o,
});
const HIDDEN = { at: "2026-10-02T00:00:00Z", byName: "Dr. A", reason: "x" };

describe("copyIsShared", () => {
  it("shared and not hidden: on; hidden, unshared or no copy: off", () => {
    expect(copyIsShared([copy({ prescriptionId: "rx1" })], "prescription", "rx1")).toBe(true);
    expect(copyIsShared([copy({ prescriptionId: "rx1", hidden: HIDDEN })], "prescription", "rx1")).toBe(false);
    expect(copyIsShared([copy({ prescriptionId: "rx1", shared: false })], "prescription", "rx1")).toBe(false);
    expect(copyIsShared([copy({ prescriptionId: "rx2" })], "prescription", "rx1")).toBe(false);
    expect(copyIsShared([copy({ medicalDocumentId: "rx1", source: "medical_document" })], "prescription", "rx1")).toBe(false);
    expect(copyIsShared([], "medical_document", "d1")).toBe(false);
  });

  it("follows a copy to its newest replacement (an edit's or a correction's copy)", () => {
    const docs = [
      copy({ id: "c1", medicalDocumentId: "d1", source: "medical_document", replaced: true }),
      copy({ id: "c2", medicalDocumentId: "d2", source: "medical_document", replacesId: "c1", hidden: HIDDEN }),
    ];
    // The correction's copy is what the patient would see, and it's hidden.
    expect(copyIsShared(docs, "medical_document", "d1")).toBe(false);
    docs[1] = { ...docs[1], hidden: null };
    expect(copyIsShared(docs, "medical_document", "d1")).toBe(true);
  });
});

// ── The dialogs ──
const h = vi.hoisted(() => ({ shared: false, calls: [] as unknown[][], gate: null as null | Promise<void> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({ ok: true, data: "new" })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({
  loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })),
  copySharedNow: vi.fn(async (...args: unknown[]) => { h.calls.push(args); if (h.gate) await h.gate; return h.shared; }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots", () => ({ shareRxSnapshot: vi.fn(async () => "shared"), shareDocumentSnapshot: vi.fn(async () => "shared") }));

import { PatientTabs, type Rx } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import type { MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";

const ME = "11111111-1111-4111-8111-111111111111";
const patient = { id: "22222222-2222-4222-8222-222222222222", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };
// Older than 24 h: "Adicionar correção".
const rx: Rx = { id: "33333333-3333-4333-8333-333333333333", date: "2026-10-05", created_at: "2026-10-05T12:00:00Z", created_by: ME, prescription_items: [{ name: "Dipirona", dosage: "1 cp", frequency: "6/6 h", duration: "3 dias" }] } as Rx;
const doc: MedDoc = { id: "44444444-4444-4444-8444-444444444444", doc_type: "certificate", language: "pt-BR", fields: { variant: "attendance", date: "2026-10-06", from: "09:00", to: "10:00", includeCid: false }, body: "Atesto que Ana…", created_at: "2026-10-06T12:00:00Z", created_by: ME } as MedDoc;

function renderTab(o: { rx?: boolean; doc?: boolean }) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={patient} records={[]} prescriptions={o.rx ? [rx] : []} appointments={[]} locale="pt-BR" currentUserId={ME} timeZone="America/Sao_Paulo"
        documentsOn medicalDocs={{ list: o.doc ? [doc] : [], country: "BR", hasPatientId: true }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Receitas/ }));
}
const correct = () => fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.addCorrection }));

beforeEach(() => { h.shared = false; h.calls = []; h.gate = null; });

describe("the share box when correcting", () => {
  it("a prescription whose copy the doctor hid (or never shared): OFF", async () => {
    renderTab({ rx: true });
    correct();
    await waitFor(() => expect(h.calls).toEqual([[patient.id, "prescription", rx.id]]));
    expect(screen.getByTestId("share-rx-with-patient")).not.toBeChecked();
  });

  it("a prescription the patient sees now: ON once known", async () => {
    h.shared = true;
    renderTab({ rx: true });
    correct();
    await waitFor(() => expect(screen.getByTestId("share-rx-with-patient")).toBeChecked());
  });

  it("the doctor's own click wins over a late answer", async () => {
    h.shared = false;
    let release!: () => void;
    h.gate = new Promise<void>((r) => { release = r; });
    renderTab({ rx: true });
    correct();
    const box = screen.getByTestId("share-rx-with-patient");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    await act(async () => { release(); });
    expect(box).toBeChecked();
  });

  it("a new prescription stays ON, with no lookup", async () => {
    renderTab({});
    fireEvent.click(await screen.findByRole("button", { name: pt.documents.addPrescription }));
    expect(screen.getByTestId("share-rx-with-patient")).toBeChecked();
    expect(h.calls).toEqual([]);
  });

  it("a document: OFF when hidden, ON when the patient sees it", async () => {
    renderTab({ doc: true });
    correct();
    await waitFor(() => expect(h.calls).toEqual([[patient.id, "medical_document", doc.id]]));
    expect(screen.getByTestId("share-with-patient")).not.toBeChecked();
  });

  it("a document the patient sees now: ON", async () => {
    h.shared = true;
    renderTab({ doc: true });
    correct();
    await waitFor(() => expect(screen.getByTestId("share-with-patient")).toBeChecked());
  });
});
