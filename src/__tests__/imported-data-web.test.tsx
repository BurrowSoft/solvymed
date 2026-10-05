import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// Web parity (cf): the app's "Dados importados" on the patient page, 1:1.
// Doctor only, loaded (and logged by the RPC) on every opening, the import
// line in the reader's calendar, the app's strings.

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/import-extra-action", () => ({ getImportExtra: h.get }));

import { ImportedData } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/ImportedData";

const P = "11111111-1111-4111-8111-111111111111";
const show = (locale = "pt-BR", messages: object = pt) =>
  render(<NextIntlClientProvider locale={locale} messages={messages}><ImportedData patientId={P} /></NextIntlClientProvider>);

beforeEach(() => h.get.mockReset());

describe("Dados importados (web)", () => {
  it("closed until opened; each opening reads (and so logs) again", async () => {
    h.get.mockResolvedValue({ data: { Alergias: "Dipirona" }, source: "iclinic", importedAt: "2026-09-30T15:00:00Z" });
    show();
    expect(h.get).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: pt.patientDetail.importedData });
    fireEvent.click(toggle);
    await screen.findByText("Dipirona");
    expect(screen.getByText("Alergias")).toBeInTheDocument();
    expect(screen.getByTestId("patient-imported-from").textContent).toBe("Importado de iClinic em 30/09/2026");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    expect(h.get).toHaveBeenCalledWith(P);
  });

  it("our template reads 'uma planilha'; nothing else in the file: the app's line", async () => {
    h.get.mockResolvedValue({ data: null, source: "solvymed_template", importedAt: "2026-09-30T15:00:00Z" });
    show();
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.importedData }));
    await screen.findByText(pt.patientDetail.importedDataNone);
    expect(screen.getByTestId("patient-imported-from").textContent).toContain("Importado de uma planilha em");
  });

  it("refused or failed: a generic error, no data", async () => {
    h.get.mockResolvedValue(null);
    show();
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.importedData }));
    await screen.findByText(pt.patientDetail.genericError);
  });

  it("the app's strings in en / pt-BR / th", () => {
    expect([en.patientDetail.importedData, en.patientDetail.importedFrom, en.patientDetail.importedDataNone, en.patientDetail.importSourceGeneric])
      .toEqual(["Imported data", "Imported from {source} on {date}", "The file had no other data for this patient.", "a spreadsheet"]);
    expect([pt.patientDetail.importedData, pt.patientDetail.importedFrom, pt.patientDetail.importedDataNone, pt.patientDetail.importSourceGeneric])
      .toEqual(["Dados importados", "Importado de {source} em {date}", "O arquivo não trouxe outros dados deste paciente.", "uma planilha"]);
    expect([th.patientDetail.importedData, th.patientDetail.importedFrom, th.patientDetail.importedDataNone, th.patientDetail.importSourceGeneric])
      .toEqual(["ข้อมูลที่นำเข้า", "นำเข้าจาก {source} เมื่อ {date}", "ไฟล์ไม่มีข้อมูลอื่นของผู้ป่วยรายนี้", "สเปรดชีต"]);
  });
});
