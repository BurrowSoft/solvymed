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

describe("the text follows its fields (1.9.0, c5's rule, the same in the app)", () => {
  const certificate = () => {
    open("BR", []);
    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    const dialog = screen.getByTestId("document-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: T.type.certificate }));
    return { dialog, text: within(dialog).getByLabelText(T.body) as HTMLTextAreaElement };
  };

  it("edited text is kept when a field changes, with the note and the refill; refilling clears both", () => {
    const { dialog, text } = certificate();
    expect(within(dialog).queryByTestId("text-mismatch")).toBeNull();
    // The doctor's own words, then the days change: kept, with the note.
    fireEvent.change(text, { target: { value: `${text.value} Repouso absoluto.` } });
    // Edited, but no field changed yet: the refill button, no note.
    expect(within(dialog).queryByTestId("text-mismatch")).toBeNull();
    expect(within(dialog).getByRole("button", { name: T.refill })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(T.days), { target: { value: "3" } });
    expect(text.value).toContain("Repouso absoluto.");
    expect(text.value).toContain("necessita de 1 dia(s)");
    expect(within(dialog).getByTestId("text-mismatch")).toHaveTextContent(T.textMayNotMatch);
    fireEvent.click(within(dialog).getByRole("button", { name: T.refill }));
    expect(text.value).toContain("necessita de 3 dia(s)");
    expect(within(dialog).queryByTestId("text-mismatch")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: T.refill })).toBeNull();
  });

  it("untouched text (only trailing spaces added) still follows the fields", () => {
    const { dialog, text } = certificate();
    fireEvent.change(text, { target: { value: `${text.value}   ` } });
    fireEvent.change(within(dialog).getByLabelText(T.days), { target: { value: "4" } });
    expect(text.value).toContain("necessita de 4 dia(s)");
    expect(within(dialog).queryByTestId("text-mismatch")).toBeNull();
  });

  it("a saved certificate reopened: its generated text still follows the fields (no stored flag)", async () => {
    const { prefilledBody } = await import("@/lib/medicalDocuments");
    const fields = { variant: "absence", date: "2026-10-06", days: 2, start: "2026-10-06", includeCid: false } as const;
    const saved: MedDoc = { ...doc, id: "d2", fields: { ...fields }, body: prefilledBody("certificate", fields as never, "pt-BR", "Ana Souza"), created_at: new Date().toISOString(), created_by: "doc" } as MedDoc;
    open("BR", [saved]);
    fireEvent.click(within(screen.getByTestId("medical-doc")).getByRole("button", { name: pt.patientDetail.editEntry }));
    const dialog = screen.getByTestId("document-dialog");
    const text = within(dialog).getByLabelText(T.body) as HTMLTextAreaElement;
    fireEvent.change(within(dialog).getByLabelText(T.days), { target: { value: "3" } });
    expect(text.value).toContain("necessita de 3 dia(s)");
    expect(within(dialog).queryByTestId("text-mismatch")).toBeNull();
  });
});

describe("a new document's dates default to the PRACTICE's today (1.9.0, as the app's clinicToday)", () => {
  it("20:00 in São Paulo is already tomorrow in Bangkok: a Bangkok practice's certificate starts tomorrow", () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T20:00:00-03:00"), shouldAdvanceTime: true });
    try {
      render(
        <NextIntlClientProvider locale="pt-BR" messages={pt}>
          <PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="doc" timeZone="Asia/Bangkok"
            medicalDocs={{ list: [], country: "BR", hasPatientId: true }} />
        </NextIntlClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: T.tabTitle.replace("{n}", "0") }));
      fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
      const dialog = screen.getByTestId("document-dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: T.type.certificate }));
      // The browser (the test runs in São Paulo time) says the 13th; the practice says the 14th.
      expect((within(dialog).getByLabelText(T.body) as HTMLTextAreaElement).value).toContain("14 de outubro de 2026");
      expect(within(dialog).getAllByDisplayValue("14/10/2026").length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
