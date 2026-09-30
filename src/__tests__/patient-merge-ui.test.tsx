import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import type { MergeRow } from "@/lib/patientMerge";

// Mesclar pacientes on the website: the dialog (133; the app's MergePatientsModal).

const row = (o: Partial<MergeRow>): MergeRow => ({
  id: "x", full_name: "", cpf: null, th_national_id: null, passport_number: null, birth_date: null, sex: null, phone: null,
  emergency_phone: null, email: null, rg: null, profession: null, convenio_type: null, photo_url: null, archived_at: null, booking_blocked: false, ...o,
});
const A = row({ id: "a", full_name: "Bia Souza", cpf: "529.982.247-25", email: "a@x.invalid" });
const B = row({ id: "b", full_name: "bia souza", email: "b@x.invalid", phone: "+5511955550133" });

// The dialog: pick → only the differing fields → Mesclar? → São a mesma pessoa.
const ui = vi.hoisted(() => ({ merged: [] as unknown[], push: vi.fn(), rows: null as unknown[] | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: ui.push, refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  searchMergeCandidates: async () => [{ id: "b", full_name: "bia souza", birth_date: null, archived: true }],
  loadMergeComparison: async () => ({
    rows: ui.rows ?? [A, B],
    preview: { a: { appointments: 3, records: 2, prescriptions: 1, files: 0, hasAppAccount: false }, b: { appointments: 5, records: 0, prescriptions: 0, files: 4, hasAppAccount: true } },
  }),
  mergePatientsAction: async (...args: unknown[]) => { ui.merged.push(args); return { ok: true, keptId: "b" }; },
}));

describe("MergePatientButton", async () => {
  const { MergePatientButton } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MergePatient");
  it("keeps the record that uses the app by default, shows only the differing fields, asks twice when the app is involved", async () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MergePatientButton patientId="a" patientName="Bia Souza" locale="pt-BR" /></NextIntlClientProvider>);
    fireEvent.click(screen.getByText("Mesclar com outro paciente…"));
    expect(screen.getByText("Qual cadastro é a mesma pessoa que «Bia Souza»?")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("bia souza"));
    // B uses the app: it's the one kept by default.
    expect(await screen.findByText("usa o app")).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: /Manter este cadastro/ })[0]).toBeChecked();
    expect(screen.getByText("CPF")).toBeInTheDocument();
    expect(screen.queryByText("Nome completo")).toBeNull(); // the same name (case aside): not shown
    expect(screen.getByText("1 campo igual")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mesclar"));
    expect(screen.getByText("Mesclar?")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Mesclar").at(-1)!);
    expect(screen.getByText(/usa o app\. Depois de mesclar/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("São a mesma pessoa"));
    await waitFor(() => expect(ui.merged).toHaveLength(1));
    expect(ui.merged[0]).toEqual(["b", "a", { cpf: "merged" }, true]);
    expect(ui.push).toHaveBeenCalledWith("/pt-BR/dashboard/patients/b?merged=1");
  });

  it("cards carry subtitles; swapping the kept record keeps the chosen values; the confirm names same-name records by what differs", async () => {
    ui.merged = [];
    ui.rows = [
      row({ id: "a", full_name: "Bia Souza", birth_date: "1980-03-12", email: "a@x.invalid", created_at: new Date(2026, 0, 5, 10).toISOString() }),
      row({ id: "b", full_name: "bia souza", birth_date: "1991-07-01", email: "b@x.invalid", created_at: new Date(2026, 5, 7, 10).toISOString(), import_id: "imp" }),
    ];
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MergePatientButton patientId="a" patientName="Bia Souza" locale="pt-BR" /></NextIntlClientProvider>);
    fireEvent.click(screen.getByText("Mesclar com outro paciente…"));
    fireEvent.click(await screen.findByText("bia souza"));
    expect(await screen.findByText("Nasc. 12/03/1980 · Cadastrado em 05/01/2026")).toBeInTheDocument();
    expect(screen.getByText("Nasc. 01/07/1991 · Importado em 07/06/2026")).toBeInTheDocument();
    // B uses the app, so it stays first (cards and columns: kept, then
    // removed). Pick A's email (the removed side), then keep A instead: A's
    // email is still the chosen one, now on the kept side.
    const emailRadios = () => screen.getAllByRole("radio").filter((r) => r.getAttribute("name") === "f-email");
    fireEvent.click(emailRadios()[1]);
    fireEvent.click(screen.getAllByRole("radio", { name: /Manter este cadastro/ })[1]);
    expect(emailRadios()[0]).toBeChecked();
    expect(emailRadios()[1]).not.toBeChecked();
    fireEvent.click(screen.getByText("Mesclar"));
    expect(screen.getByText("Tudo de «bia souza (nasc. 01/07/1991)» passa para «Bia Souza (nasc. 12/03/1980)» e «bia souza (nasc. 01/07/1991)» deixa de existir. Isso não pode ser desfeito.")).toBeInTheDocument();
    ui.rows = null;
  });
});
