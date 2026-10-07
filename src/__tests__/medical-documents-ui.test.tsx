import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.8.0 B on the website: "Receitas e documentos" (cf): two buttons, one
// list newest first with type chips; the document dialog picks the type,
// prefills the sentence in the document's language and keeps the doctor's
// own text; the controlled prescription is Portuguese and print-only.

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown[] }[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => Object.fromEntries([
  "createRecord", "deleteRecord", "updateRecord", "addRecordCorrection", "createPrescription", "deletePrescription", "updatePrescription",
  "addPrescriptionCorrection", "updatePatient", "deletePatient", "toggleBookingBlock", "generatePatientInviteCode", "getArchivePreview",
  "archivePatient", "restorePatient", "loadAccessLog", "mergeAvailable",
].map((n) => [n, vi.fn(async () => ({}))])));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => ({ listPatientFiles: vi.fn(async () => ({ ok: true, data: [] })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({ loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => {
  const rec = (fn: string) => vi.fn(async (...args: unknown[]) => { h.calls.push({ fn, args }); return { ok: true, data: "new" }; });
  return { createMedicalDocument: rec("create"), updateMedicalDocument: rec("update"), correctMedicalDocument: rec("correct"), deleteMedicalDocument: rec("delete"), documentPrintData: rec("print") };
});

import { PatientTabs, type Rx } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import type { MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";

const T = pt.documents;
const patient = { id: "pat", full_name: "Ana Souza", created_at: "2026-10-01T12:00:00Z" };
const rx: Rx = { id: "rx1", date: "2026-10-05", created_at: "2026-10-05T12:00:00Z", prescription_items: [{ name: "Dipirona", dosage: "1 cp", frequency: "6/6 h", duration: "3 dias" }] };
const doc: MedDoc = { id: "d1", doc_type: "certificate", language: "pt-BR", fields: { variant: "attendance", date: "2026-10-06", from: "09:00", to: "10:00", includeCid: false }, body: "Atesto que Ana…", created_at: "2026-10-06T12:00:00Z" };

function open(country = "BR", list: MedDoc[] = [doc], hasPatientId = true) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={patient} records={[]} prescriptions={[rx]} appointments={[]} locale="pt-BR" currentUserId="doc" timeZone="America/Sao_Paulo"
        medicalDocs={{ list, country, hasPatientId }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: T.tabTitle.replace("{n}", String(1 + list.length)) }));
}
beforeEach(() => { h.calls.length = 0; });

describe("Receitas e documentos", () => {
  it("two buttons; one list newest first, with the type chip", () => {
    open();
    expect(screen.getByRole("button", { name: T.addPrescription })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.addDocument })).toBeInTheDocument();
    const entries = screen.getAllByText(/Atesto que Ana|Dipirona/);
    expect(entries[0]).toHaveTextContent("Atesto que Ana");
    expect(within(screen.getByTestId("medical-doc")).getByText(T.type.certificate)).toBeInTheDocument();
  });

  it("+ Documento: the country's types; the sentence prefilled and kept in sync until the doctor edits it", async () => {
    open("BR", []);
    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    const dialog = screen.getByTestId("document-dialog");
    expect(within(dialog).getByRole("button", { name: T.type.controlled_prescription })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: T.type.certificate }));
    const text = within(dialog).getByLabelText(T.body) as HTMLTextAreaElement;
    expect(text.value).toMatch(/^Atesto, para os devidos fins, que Ana Souza esteve sob meus cuidados em .* e necessita de 1 dia\(s\)/);
    fireEvent.change(within(dialog).getByLabelText(T.days), { target: { value: "3" } });
    expect(text.value).toContain("necessita de 3 dia(s)");
    fireEvent.change(text, { target: { value: "Meu texto." } });
    fireEvent.change(within(dialog).getByLabelText(T.days), { target: { value: "5" } });
    expect(text.value).toBe("Meu texto.");
    fireEvent.click(within(dialog).getByRole("button", { name: T.save }));
    await waitFor(() => expect(h.calls.find((c) => c.fn === "create")).toBeTruthy());
    const [pid, payload] = h.calls.find((c) => c.fn === "create")!.args as [string, { type: string; lang: string; body: string }];
    expect(pid).toBe("pat");
    expect(payload).toMatchObject({ type: "certificate", lang: "pt-BR", body: "Meu texto." });
  });

  it("the controlled prescription: no language picker, the print-only note, and the ID warning", () => {
    open("BR", [], false);
    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    const dialog = screen.getByTestId("document-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: T.type.controlled_prescription }));
    expect(within(dialog).queryByLabelText(T.language)).toBeNull();
    expect(within(dialog).getByText(T.controlledPrintOnly)).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(T.controlledNeedsId);
  });

  it("the special control prescription prints (ad, as the app); the others download", () => {
    const controlled: MedDoc = { id: "d2", doc_type: "controlled_prescription", language: "pt-BR", fields: { items: [{ name: "Clonazepam 2 mg", dose: "", quantity: "30", posology: "" }] }, body: null, created_at: "2026-10-07T12:00:00Z" };
    open("BR", [controlled, doc]);
    const [first, second] = screen.getAllByTestId("medical-doc");
    expect(within(first).getByRole("button", { name: T.print })).toBeInTheDocument();
    expect(within(first).queryByRole("button", { name: T.download })).toBeNull();
    expect(within(second).getByRole("button", { name: T.download })).toBeInTheDocument();
  });

  it("a Thai practice offers the Thai types", () => {
    open("TH", []);
    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    const dialog = screen.getByTestId("document-dialog");
    expect(within(dialog).getAllByRole("button", { name: T.type.th_certificate }).length).toBeGreaterThan(0);
    expect(within(dialog).queryByRole("button", { name: T.type.controlled_prescription })).toBeNull();
  });
});
