import { beforeEach, describe, expect, it, vi } from "vitest";
import { csvCell, csvSeparator, patientsCsv, type CsvLabels } from "@/lib/patientsCsv";

// The patient CSV (Help P10): the app's rules, and fail closed on the
// access log (UX 36, migration 126).

const L: CsvLabels = {
  fullName: "Nome", cpf: "CPF", thaiId: "Thai ID", passport: "Passaporte", sex: "Sexo", birthDate: "Nascimento", phone: "Telefone",
  email: "E-mail", profession: "Profissão", tags: "Etiquetas", archivedOn: "Arquivado em", male: "Masculino", female: "Feminino", other: "Outro",
};

describe("patientsCsv", () => {
  it("quotes every cell and neutralises formulas", () => {
    expect(csvCell('Ana "A"')).toBe('"Ana ""A"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+55 11")).toBe(`"'+55 11"`);
    expect(csvCell(null)).toBe('""');
  });

  it("; where decimals use a comma", () => {
    expect(csvSeparator("pt-BR")).toBe(";");
    expect(csvSeparator("en")).toBe(",");
  });

  it("the practice country's ID columns and date format, a BOM, archived date", () => {
    const br = patientsCsv([{ full_name: "Ana", cpf: "123", sex: "female", birth_date: "1980-02-01", tags: ["vip"], archived_at: "2026-09-01T10:00:00Z" }], L, "BR", "pt-BR");
    expect(br.charCodeAt(0)).toBe(0xfeff);
    const [head, row] = br.slice(1).split("\r\n");
    expect(head).toBe('"Nome";"CPF";"Sexo";"Nascimento";"Telefone";"E-mail";"Profissão";"Etiquetas";"Arquivado em"');
    expect(row).toBe('"Ana";"123";"Feminino";"01/02/1980";"";"";"";"vip";"01/09/2026"');
    const th = patientsCsv([{ full_name: "Somchai", th_national_id: "1101700000000", passport_number: "", birth_date: "1980-02-01" }], L, "TH", "en");
    expect(th.slice(1).split("\r\n")[0]).toContain('"Thai ID","Passaporte"');
    expect(th).toContain('"01/02/2523"');
  });
});

const h = vi.hoisted(() => ({
  met: true,
  role: "professional",
  patients: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  logError: null as unknown,
}));
vi.mock("@/lib/conditions", () => ({ conditionMet: () => h.met }));
vi.mock("@/lib/practiceCountry", () => ({ getPracticeCountry: async () => "BR" }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => { h.rpc.push({ fn, args }); return { data: 1, error: h.logError }; },
    from: (table: string) => {
      let range: [number, number] = [0, 0];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.maybeSingle = async () => ({ data: table === "user_roles" ? { role: h.role } : null, error: null });
      q.range = (a: number, b: number) => { range = [a, b]; return q; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: h.patients.slice(range[0], range[1] + 1), error: null }).then(res);
      return q;
    },
  }),
}));

import { GET } from "@/app/api/patients/export/route";
import { NextRequest } from "next/server";

const req = () => new NextRequest("https://www.solvymed.com/api/patients/export?locale=pt-BR");
const P = (i: number) => ({ id: `p-${i}`, full_name: `Paciente ${i}`, cpf: null });

describe("GET /api/patients/export", () => {
  beforeEach(() => { h.met = true; h.role = "professional"; h.patients = [P(1), P(2)]; h.rpc = []; h.logError = null; });

  it("off until migration 126", async () => {
    h.met = false;
    expect((await GET(req())).status).toBe(404);
  });

  it("doctor only", async () => {
    h.role = "secretary";
    expect((await GET(req())).status).toBe(403);
    expect(h.rpc).toEqual([]);
  });

  it("logs every exported patient first, in one all-or-nothing call, then sends the file", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(h.rpc).toEqual([{ fn: "log_record_access_batch", args: { p_patient_ids: ["p-1", "p-2"], p_kind: "export", p_object_ref: "csv" } }]);
    const text = await res.text();
    expect(text).toContain('"Paciente 1"');
    expect(text).toContain('"Paciente 2"');
  });

  it("no file when the access log fails (fail closed)", async () => {
    h.logError = { message: "not_allowed" };
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "access_log_failed" });
  });

  it("every page of patients", async () => {
    h.patients = Array.from({ length: 1500 }, (_, i) => P(i));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((h.rpc[0].args.p_patient_ids as string[]).length).toBe(1500);
  });
});
