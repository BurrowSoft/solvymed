import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import type { ImportDb } from "@/lib/import/api";

// Importar pacientes, end to end in the browser against a fake database:
// file → columns → check → review → import → undo.

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { ImportClient } from "@/app/[locale]/(site)/dashboard/patients/import/ImportClient";

type Row = { row_no: number; outcome: string; duplicate_of_row: number | null; warnings: string[]; errors: string[]; input: Record<string, unknown> };
const ROWS: Row[] = [
  { row_no: 2, outcome: "new", duplicate_of_row: null, warnings: [], errors: [], input: { full_name: "Maria Silva" } },
  { row_no: 3, outcome: "invalid", duplicate_of_row: null, warnings: [], errors: ["full_name_missing"], input: {} },
];

function fakeDb(summary: Record<string, number> = {}, previewRows: Row[] = ROWS, lastImports: unknown[] = []) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const staged: { row: number; full_name?: string }[] = [];
  const db: ImportDb = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "import_patients_begin") return Promise.resolve({ data: "imp-1", error: null });
      if (fn === "import_patients_add_rows") { staged.push(...(args!.p_rows as typeof staged)); return Promise.resolve({ data: 2, error: null }); }
      if (fn === "import_patients_validate") return Promise.resolve({ data: { total: 2, new: 1, existing: 0, duplicate_in_file: 0, invalid: 1, with_warnings: 0, existing_to_fill: 0, ...summary }, error: null });
      if (fn === "import_patients_commit") return Promise.resolve({ data: { total: 2, created: 1, filled: 0, existing_skipped: 0, duplicate_in_file: 0, invalid: 1, conflicts: 0 }, error: null });
      if (fn === "import_patients_undo") return Promise.resolve({ data: { deleted: 1, kept: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      select: () => ({
        eq: () => {
          const rows = previewRows;
          const range = () => Promise.resolve({ data: rows, error: null });
          const limit = () => Promise.resolve({ data: lastImports, error: null });
          return { or: () => ({ order: () => ({ range }) }), order: () => ({ range }), gte: () => ({ order: () => ({ limit }) }) };
        },
      }),
    }),
  };
  return { db, calls, staged };
}

const csvFile = (text: string, name = "pacientes.csv") => {
  const f = new File([text], name, { type: "text/csv" });
  // jsdom's File may lack arrayBuffer().
  if (!f.arrayBuffer) Object.defineProperty(f, "arrayBuffer", { value: () => Promise.resolve(new TextEncoder().encode(text).buffer) });
  return f;
};

describe("Importar pacientes", () => {
  it("reads the file, maps the columns, checks, previews, imports and undoes", async () => {
    const { db, calls, staged } = fakeDb();
    const { container } = render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ImportClient locale="pt-BR" country="BR" db={db} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Nada é salvo até você confirmar a importação.")).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile("Nome;Sobrenome;CPF;Plano\nMaria;Silva;123.456.789-09;Ouro\n;;;\n;;111;\n")] } });

    // Columns: Nome + Sobrenome joined; the unknown column kept as imported data.
    expect(await screen.findByText("Nome completo = Nome + Sobrenome")).toBeInTheDocument();
    expect(screen.getByText("Colunas guardadas como dados importados ficam visíveis só para você (médico), nunca para a secretária.")).toBeInTheDocument();
    expect((screen.getByLabelText("Plano") as HTMLSelectElement).value).toBe("extra");
    expect(calls).toEqual([]); // nothing sent yet

    fireEvent.click(screen.getByText("Verificar planilha"));
    expect(await screen.findByText("1 novos · 0 já existem · 1 com erro")).toBeInTheDocument();
    expect(staged[0]).toEqual({ row: 2, full_name: "Maria Silva", cpf: "123.456.789-09", extra: { Plano: "Ouro" } });
    expect(screen.getByText("Sem nome (linha não importada)")).toBeInTheDocument();
    expect(calls.map((c) => c.fn)).toEqual(["import_patients_begin", "import_patients_add_rows", "import_patients_validate"]);

    fireEvent.click(screen.getByText("Importar 1 paciente"));
    expect(await screen.findByText("Importação concluída")).toBeInTheDocument();
    expect(screen.getByText("1 paciente cadastrado")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText("Desfazer importação"));
    await waitFor(() => expect(screen.getByText("Importação desfeita: 1 removidos · 0 mantidos (já em uso)")).toBeInTheDocument());
  });

  it("a ZIP gets UX's message; nothing is sent", async () => {
    const { db, calls } = fakeDb();
    const { container } = render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ImportClient locale="pt-BR" country="BR" db={db} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [csvFile("x", "export.zip")] } });
    expect(await screen.findByText(pt.patientImport.file_zip)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("CPFs Excel stripped of the leading zero: 130's count line, the row's warning, and the Excel hint on a 9/10-digit CPF still invalid", async () => {
    const { db } = fakeDb({ total: 3, new: 2, invalid: 1, with_warnings: 1, cpf_zero_padded: 1 }, [
      { row_no: 2, outcome: "new", duplicate_of_row: null, warnings: ["cpf_zero_padded"], errors: [], input: { full_name: "Ana Zero", cpf: "1234567890" } },
      { row_no: 3, outcome: "new", duplicate_of_row: null, warnings: [], errors: ["cpf_invalid"], input: { full_name: "Bia Dez", cpf: "1234567891" } },
      { row_no: 4, outcome: "new", duplicate_of_row: null, warnings: [], errors: ["cpf_invalid"], input: { full_name: "Caio Onze", cpf: "123.456.789-00" } },
    ]);
    const { container } = render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ImportClient locale="pt-BR" country="BR" db={db} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [csvFile("Nome;CPF\nAna;1234567890\n")] } });
    fireEvent.click(await screen.findByText("Verificar planilha"));
    expect(await screen.findByText("1 CPF estava sem o zero inicial (o Excel remove) e foi completado.")).toBeInTheDocument();
    expect(screen.getByText(pt.patientImport.code_cpf_zero_padded)).toBeInTheDocument();
    const hint = `${pt.patientImport.code_cpf_invalid}. ${pt.patientImport.cpfExcelHint}`;
    expect(screen.getByText(hint)).toBeInTheDocument();
    // An 11-digit invalid CPF didn't lose a zero: no Excel hint.
    expect(screen.getAllByText(pt.patientImport.code_cpf_invalid)).toHaveLength(1);
  });

  it("139 (address live): the CEP line, a too-long address part named by its label, CNS warnings", async () => {
    const { db } = fakeDb({ total: 1, new: 1, invalid: 0, with_warnings: 1, cep_zero_padded: 2 }, [
      { row_no: 2, outcome: "new", duplicate_of_row: null, warnings: ["address_street_invalid", "cep_zero_padded", "cns_invalid"], errors: [], input: { full_name: "Ana" } },
    ]);
    const { container } = render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ImportClient locale="pt-BR" country="BR" addressLive db={db} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [csvFile("Nome;CEP\nAna;1310100\n")] } });
    expect(await screen.findByLabelText("CEP")).toHaveValue("address_postal_code");
    fireEvent.click(screen.getByText("Verificar planilha"));
    expect(await screen.findByText("2 CEPs estavam sem o zero inicial (o Excel remove) e foram completados.")).toBeInTheDocument();
    expect(screen.getByText(`Rua: texto longo demais (não importado) · ${pt.patientImport.code_cep_zero_padded} · ${pt.patientImport.code_cns_invalid}`)).toBeInTheDocument();
  });

  it("Última importação: the card undoes the last import after leaving the page, then goes away", async () => {
    const { db, calls } = fakeDb({}, ROWS, [{ id: "imp-7", source: "prontuario_verde", committed_at: "2026-10-01T02:30:00Z", summary: { created: 12 } }]);
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <ImportClient locale="pt-BR" country="BR" timeZone="America/Sao_Paulo" db={db} />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("Última importação")).toBeInTheDocument();
    expect(screen.getByText("30/09/2026 às 23:30 · 12 pacientes de Prontuário Verde")).toBeInTheDocument();
    expect(screen.getByText("Disponível até 01/10/2026 às 23:30.")).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText("Desfazer importação"));
    await waitFor(() => expect(screen.getByText("Importação desfeita: 1 removidos · 0 mantidos (já em uso)")).toBeInTheDocument());
    expect(calls.find((c) => c.fn === "import_patients_undo")?.args).toEqual({ p_import_id: "imp-7" });
    expect(screen.queryByText("Última importação")).toBeNull();
  });
});
