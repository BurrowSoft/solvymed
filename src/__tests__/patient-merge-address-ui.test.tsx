import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import type { MergeRow } from "@/lib/patientMerge";

// The merge dialog once 138 + 139 are applied: the address as one block, the
// CNS, and Observações with "As duas, juntas" (or UX's too-long text).

const row = (o: Partial<MergeRow>): MergeRow => ({
  id: "x", full_name: "Bia", cpf: null, th_national_id: null, passport_number: null, birth_date: null, sex: null, phone: null,
  emergency_phone: null, email: null, rg: null, profession: null, convenio_type: null, photo_url: null, archived_at: null, booking_blocked: false, ...o,
});
const ui = vi.hoisted(() => ({ merged: [] as unknown[], rows: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  searchMergeCandidates: async () => [{ id: "b", full_name: "Bia B", birth_date: null, archived: false }],
  loadMergeComparison: async () => ({
    rows: ui.rows,
    preview: { a: { appointments: 0, records: 0, prescriptions: 0, files: 0, hasAppAccount: false }, b: { appointments: 0, records: 0, prescriptions: 0, files: 0, hasAppAccount: false } },
    address: true,
  }),
  mergePatientsAction: async (...args: unknown[]) => { ui.merged.push(args); return { ok: true, keptId: "a" }; },
}));

// Imported once, after the mocks (vi.mock is hoisted): compiling the dialog
// inside a test ate its time budget when the whole suite ran in parallel.
import { MergePatientButton } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MergePatient";

async function open() {
  render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MergePatientButton patientId="a" patientName="Bia" locale="pt-BR" /></NextIntlClientProvider>);
  fireEvent.click(screen.getByText("Mesclar com outro paciente…"));
  fireEvent.click(await screen.findByText("Bia B"));
  await screen.findAllByRole("radio", { name: /Manter este cadastro/ });
}
async function mergeNow() {
  fireEvent.click(screen.getByText("Mesclar"));
  fireEvent.click(screen.getAllByText("Mesclar").at(-1)!);
  await waitFor(() => expect(ui.merged.length).toBeGreaterThan(0));
  return (ui.merged.at(-1) as unknown[])[2];
}

// A full dialog walk-through: 5 s is tight when the whole suite runs in parallel.
describe("MergePatientButton × 139", { timeout: 20000 }, () => {
  it("address block, CNS and notes joined by default; the choices go out as 139 expects", async () => {
    ui.merged = [];
    ui.rows = [
      row({ id: "a", address_street: "Rua A", address_city: "Santos", cns: "700000000000005", notes_admin: "Prefere manhã" }),
      row({ id: "b", address_street: "Rua B", address_city: "Santos", notes_admin: "Convênio X" }),
    ];
    await open();
    expect(screen.getByText("Endereço")).toBeInTheDocument();
    expect(screen.getByText("Rua A, Santos")).toBeInTheDocument();
    expect(screen.getByText("CNS (Cartão Nacional de Saúde)")).toBeInTheDocument();
    expect(screen.getByLabelText("As duas, juntas")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Rua B, Santos"));
    expect(await mergeNow()).toEqual({ address: "merged", notes_admin: "both" });
  });

  it("notes too long to join: UX's text instead of the option, the kept ones sent explicitly", async () => {
    ui.merged = [];
    ui.rows = [row({ id: "a", notes_admin: "a".repeat(1500) }), row({ id: "b", notes_admin: "b".repeat(600) })];
    await open();
    expect(screen.getByText(pt.patientMerge.notesTooLong)).toBeInTheDocument();
    expect(screen.queryByLabelText("As duas, juntas")).toBeNull();
    expect(await mergeNow()).toEqual({ notes_admin: "kept" });
  });
});
