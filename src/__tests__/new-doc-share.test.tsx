import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// F1 (fa's #528 row): a NEW certificate saved with "Compartilhar com o
// paciente" ticked sometimes didn't share (no share step, no error). Save
// now takes the share choice from one source, at the click; a new one uses
// the form's id even if the answer didn't carry it; and a late default
// (the edit dialog's copy lookup) never overrides the doctor's tick.

const h = vi.hoisted(() => ({
  shared: [] as string[],
  createData: "66666666-6666-4666-8666-666666666666" as string | null,
  lookup: null as null | ((s: "on" | "off" | "unknown") => void),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  createMedicalDocument: vi.fn(async () => ({ ok: true, data: h.createData })),
  updateMedicalDocument: vi.fn(async () => ({ ok: true, data: null })),
  correctMedicalDocument: vi.fn(async () => ({ ok: true, data: "77777777-7777-4777-8777-777777777777" })),
  deleteMedicalDocument: vi.fn(), documentPrintData: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({
  loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })),
  copySharedNow: vi.fn(() => new Promise((res) => { h.lookup = res; })),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots", () => ({
  shareRxSnapshot: vi.fn(async () => "shared"),
  shareDocumentSnapshot: vi.fn(async (o: { doc: { id: string } }) => { h.shared.push(o.doc.id); return "shared"; }),
}));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import type { MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";

const ME = "33333333-3333-4333-8333-333333333333";
const patient = { id: "44444444-4444-4444-8444-444444444444", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };
const doc: MedDoc = { id: "88888888-8888-4888-8888-888888888888", doc_type: "certificate", language: "pt-BR", fields: { variant: "attendance", date: "2026-10-06", from: "09:00", to: "10:00", includeCid: false }, body: "Atesto que Ana…", created_at: new Date().toISOString(), created_by: ME } as MedDoc;
const tab = (list: MedDoc[] = []) => {
  render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId={ME} timeZone="America/Sao_Paulo" documentsOn medicalDocs={{ list, country: "BR", hasPatientId: true }} /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^Receitas/ }));
};
const newCertificate = async () => {
  fireEvent.click(await screen.findByRole("button", { name: pt.documents.addDocument }));
  const d = screen.getByTestId("document-dialog");
  fireEvent.click(within(d).getByRole("button", { name: pt.documents.type.certificate }));
  return d;
};

beforeEach(() => { h.shared = []; h.createData = "66666666-6666-4666-8666-666666666666"; h.lookup = null; });

describe("F1: a new document saved with Share on is shared", () => {
  it("new certificate, box on (the default): the share runs for the new id", async () => {
    tab();
    const d = await newCertificate();
    expect(within(d).getByTestId("share-with-patient")).toBeChecked();
    fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
    await waitFor(() => expect(h.shared).toEqual(["66666666-6666-4666-8666-666666666666"]));
  });

  it("the answer without the id: the form's own id (216) is shared, never a silent skip", async () => {
    h.createData = null;
    tab();
    const d = await newCertificate();
    fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
    await waitFor(() => expect(h.shared).toHaveLength(1));
    expect(h.shared[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("box unticked then ticked again right before Save: shared", async () => {
    tab();
    const d = await newCertificate();
    const box = within(d).getByTestId("share-with-patient");
    fireEvent.click(box);
    fireEvent.click(box);
    fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
    await waitFor(() => expect(h.shared).toHaveLength(1));
  });

  it("box unticked: no share", async () => {
    tab();
    const d = await newCertificate();
    fireEvent.click(within(d).getByTestId("share-with-patient"));
    fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.shared).toEqual([]);
  });

  it("an edit: the late default (\"off\") arriving after a quick tick-and-save never undoes the tick", async () => {
    tab([doc]);
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.editEntry }));
    const d = screen.getByTestId("document-dialog");
    // The lookup is pending; it answers "unknown"-like timing: first let it
    // settle to known-off so the box can be ticked, then tick and save at
    // once while a second (stale) answer could still land.
    await act(async () => { h.lookup!("off"); });
    const box = within(d).getByTestId("share-with-patient");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
    await waitFor(() => expect(h.shared).toEqual([doc.id]));
  });
});
