import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Parity with app #299 (e7): "Excluir cadastro" stays visible for a patient
// with appointments; a click explains it can't be deleted and offers
// Arquivar / Cancelar, sending nothing.

const h = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, {
  get: (_t, name) => name === "deletePatient" ? vi.fn(async (id: string) => { h.deleted.push(id); return {}; }) : vi.fn(async () => ({})),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";

const patient = { id: "p1", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };
const page = (hasAppointments: boolean) => render(
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone="America/Sao_Paulo"
      canDelete hasAppointments={hasAppointments} />
  </NextIntlClientProvider>,
);

describe("Excluir cadastro with appointments", () => {
  it("visible; a click explains and offers Arquivar / Cancelar; nothing is deleted", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    page(true);
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.deletePatient }));
    const box = screen.getByTestId("delete-blocked");
    expect(box).toHaveTextContent("Este paciente tem consultas registradas e não pode ser excluído. Você pode arquivá-lo.");
    expect(box.querySelectorAll("button")).toHaveLength(2);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.cancel }));
    expect(screen.queryByTestId("delete-blocked")).toBeNull();
    confirmSpy.mockRestore();
  });

  it("without appointments: the usual confirm and delete", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    page(false);
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.deletePatient }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByTestId("delete-blocked")).toBeNull();
    confirmSpy.mockRestore();
  });
});
