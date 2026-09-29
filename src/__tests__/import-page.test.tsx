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

function fakeDb() {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const staged: { row: number; full_name?: string }[] = [];
  const db: ImportDb = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === "import_patients_begin") return Promise.resolve({ data: "imp-1", error: null });
      if (fn === "import_patients_add_rows") { staged.push(...(args!.p_rows as typeof staged)); return Promise.resolve({ data: 2, error: null }); }
      if (fn === "import_patients_validate") return Promise.resolve({ data: { total: 2, new: 1, existing: 0, duplicate_in_file: 0, invalid: 1, with_warnings: 0, existing_to_fill: 0 }, error: null });
      if (fn === "import_patients_commit") return Promise.resolve({ data: { total: 2, created: 1, filled: 0, existing_skipped: 0, duplicate_in_file: 0, invalid: 1, conflicts: 0 }, error: null });
      if (fn === "import_patients_undo") return Promise.resolve({ data: { deleted: 1, kept: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      select: () => ({
        eq: () => {
          const rows = [
            { row_no: 2, outcome: "new", duplicate_of_row: null, warnings: [], errors: [], input: { full_name: "Maria Silva" } },
            { row_no: 3, outcome: "invalid", duplicate_of_row: null, warnings: [], errors: ["full_name_missing"], input: {} },
          ];
          const range = () => Promise.resolve({ data: rows, error: null });
          return { or: () => ({ order: () => ({ range }) }), order: () => ({ range }) };
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
    expect(screen.getByText("Sem nome")).toBeInTheDocument();
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
});
