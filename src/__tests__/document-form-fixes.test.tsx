import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";

// 12's #413 row on the website (ad; the app's #427/#429): the document
// dialog's titles, "Descartar alterações?" on closing with changes, the Thai
// rest period's end date, dd/mm/yyyy dates (Gregorian, the BE year as a
// hint in Thai) and the server refusing a Buddhist-era year.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => Object.fromEntries([
  "createRecord", "deleteRecord", "updateRecord", "addRecordCorrection", "createPrescription", "deletePrescription", "updatePrescription",
  "addPrescriptionCorrection", "updatePatient", "deletePatient", "toggleBookingBlock", "generatePatientInviteCode", "getArchivePreview",
  "archivePatient", "restorePatient", "loadAccessLog", "mergeAvailable",
].map((n) => [n, vi.fn(async () => ({}))])));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => ({ listPatientFiles: vi.fn(async () => ({ ok: true, data: [] })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({ loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  createMedicalDocument: vi.fn(async () => ({ ok: true, data: "new" })), updateMedicalDocument: vi.fn(async () => ({ ok: true, data: null })),
  correctMedicalDocument: vi.fn(async () => ({ ok: true, data: null })), deleteMedicalDocument: vi.fn(), documentPrintData: vi.fn(),
}));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import { restEnd, type MedDoc } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments";
import { documentDatesLookBuddhist } from "@/lib/buddhistEra";

const T = pt.documents;
const TH = (th as unknown as typeof pt);
const patient = { id: "pat", full_name: "Ana Souza", created_at: "2026-10-01T12:00:00Z" };
const recent = (): MedDoc => ({ id: "d1", doc_type: "declaration", language: "pt-BR", fields: { date: "2026-10-06", from: "09:00", to: "10:00" }, body: "Declaro…", created_at: new Date().toISOString(), created_by: "doc" });

function open(list: MedDoc[] = [], country = "BR", locale = "pt-BR", messages: typeof pt = pt) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale={locale} currentUserId="doc" timeZone="America/Sao_Paulo"
        medicalDocs={{ list, country, hasPatientId: true }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: messages.documents.tabTitle.replace("{n}", String(list.length)) }));
}
const dialog = () => screen.getByTestId("document-dialog");
const cancel = () => fireEvent.click(within(dialog()).getByRole("button", { name: pt.patientDetail.cancel }));

describe("the document dialog (12's #413 row)", () => {
  it("Editar documento: the edit title is the document's, not the prescription's", () => {
    open([recent()]);
    fireEvent.click(within(screen.getByTestId("medical-doc")).getByRole("button", { name: pt.patientDetail.editEntry }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(T.editDocument);
  });

  it("closing with changes asks \"Descartar alterações?\"; Continuar editando keeps it, Descartar closes", () => {
    open([recent()]);
    // Nothing changed (an edit opened and left): Cancel just closes.
    fireEvent.click(within(screen.getByTestId("medical-doc")).getByRole("button", { name: pt.patientDetail.editEntry }));
    cancel();
    expect(screen.queryByTestId("document-dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    fireEvent.click(within(dialog()).getByRole("button", { name: T.type.declaration }));
    cancel();
    const ask = screen.getByRole("alertdialog");
    expect(ask).toHaveTextContent(T.discardTitle);
    fireEvent.click(within(ask).getByRole("button", { name: T.keepEditing }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(dialog()).toBeInTheDocument();
    cancel();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: T.discard }));
    expect(screen.queryByTestId("document-dialog")).toBeNull();
  });

  it("dates are typed dd/mm/yyyy, never the browser's date field", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: T.addDocument }));
    fireEvent.click(within(dialog()).getByRole("button", { name: T.type.declaration }));
    expect(dialog().querySelector("input[type=date]")).toBeNull();
    expect(within(dialog()).getByPlaceholderText(pt.dateInput.placeholder)).toBeInTheDocument();
  });

  it("Thai certificate: changing the days or the start sets the end; the BE year shows under each date", () => {
    open([], "TH", "th", TH);
    fireEvent.click(screen.getByRole("button", { name: TH.documents.addDocument }));
    fireEvent.click(within(dialog()).getAllByRole("button", { name: TH.documents.type.th_certificate })[0]);
    fireEvent.click(within(dialog()).getByLabelText(TH.documents.rest));
    // A date's label also holds its BE hint ("ตั้งแต่วันที่ พ.ศ. 2569").
    const days = within(dialog()).getByLabelText(TH.documents.days) as HTMLInputElement;
    const start = within(dialog()).getByLabelText(new RegExp(`^${TH.documents.startDate}`)) as HTMLInputElement;
    const end = within(dialog()).getByLabelText(new RegExp(`^${TH.documents.endDate}`)) as HTMLInputElement;
    fireEvent.change(start, { target: { value: "08/10/2026" } });
    fireEvent.change(days, { target: { value: "3" } });
    expect(end.value).toBe("10/10/2026");
    expect(dialog()).toHaveTextContent("พ.ศ. 2569");
    expect(within(dialog()).getAllByPlaceholderText("วว/ดด/ปปปป (ค.ศ.)").length).toBeGreaterThan(0);
  });
});

describe("the rules", () => {
  it("rest end = start + days − 1", () => {
    expect(restEnd("2026-10-08", 3)).toBe("2026-10-10");
    expect(restEnd("2026-12-31", 2)).toBe("2027-01-01");
    expect(restEnd("2026-10-08", 1)).toBe("2026-10-08");
  });

  it("the server refuses a Buddhist-era year in any document date", () => {
    expect(documentDatesLookBuddhist({ date: "2569-10-07" })).toBe(true);
    expect(documentDatesLookBuddhist({ examDate: "2026-10-07", rest: { days: 2, start: "2026-10-07", end: "2569-10-08" } })).toBe(true);
    expect(documentDatesLookBuddhist({ variant: "absence", date: "2026-10-07", start: "2026-10-08" })).toBe(false);
    expect(documentDatesLookBuddhist({ exams: ["CBC"] })).toBe(false);
  });

  it("the strings (86's #427, ad's en/pt/th)", () => {
    expect([T.editDocument, T.correctDocument, T.discardTitle]).toEqual(["Editar documento", "Corrigir documento", "Descartar alterações?"]);
    expect(TH.documents.correctDocument).toBe("แก้ไขเอกสาร (บันทึกการแก้ไข)");
    expect(TH.dateInput.placeholder).toBe("วว/ดด/ปปปป (ค.ศ.)");
  });
});
