import { beforeEach, describe, expect, it, vi } from "vitest";
import { CSV_COLUMNS, csvCell, csvColumns, csvSeparator, patientsCsv, type CsvLabels } from "@/lib/patientsCsv";

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

  it("138: the address columns and the CNS (Brazil only), never Observações", () => {
    const A = ["CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "UF"];
    const p = { full_name: "Ana", cpf: "1", address_street: "Rua A", address_city: "Santos", address_state: "SP", cns: "700000000000005", notes_admin: "segredo" };
    const br = patientsCsv([p], { ...L, address: A, cns: "CNS" }, "BR", "pt-BR");
    const [head, row] = br.slice(1).split("\r\n");
    expect(head.endsWith('"Arquivado em";"CEP";"Rua";"Número";"Complemento";"Bairro";"Cidade";"UF";"CNS"')).toBe(true);
    expect(row.endsWith('"";"Rua A";"";"";"";"Santos";"SP";"700000000000005"')).toBe(true);
    expect(br).not.toContain("segredo");
    const th = patientsCsv([p], { ...L, address: A, cns: "CNS" }, "TH", "en");
    expect(th.slice(1).split("\r\n")[0]).not.toContain("CNS");
    expect(patientsCsv([p], L, "BR", "pt-BR")).not.toContain("Rua A");
  });
});

const h = vi.hoisted(() => ({
  met: true,
  address: false,
  role: "professional",
  patients: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  logError: null as unknown,
  selects: [] as string[],
}));
vi.mock("@/lib/conditions", () => ({ conditionMet: (id: string) => (id === "patient-address-live" ? h.address : h.met) }));
const country = vi.hoisted(() => ({ code: "BR" as string | null }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => (country.code ? { ok: true, country: country.code } : { ok: false, code: "exception" }) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => { h.rpc.push({ fn, args }); return { data: 1, error: h.logError }; },
    from: (table: string) => {
      let range: [number, number] = [0, 0];
      const q: Record<string, unknown> = {};
      q.select = (cols: string) => { if (table === "patients") h.selects.push(cols); return q; };
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
  beforeEach(() => { h.met = true; h.address = false; h.role = "professional"; h.patients = [P(1), P(2)]; h.rpc = []; h.logError = null; h.selects = []; });

  it("reads an explicit column list, never *", async () => {
    expect((await GET(req())).status).toBe(200);
    expect(h.selects).toEqual([CSV_COLUMNS]);
    expect(CSV_COLUMNS).not.toMatch(/\*|import|note/);
  });

  it("with 138 + 139: the address and CNS columns too, still never the notes", async () => {
    h.address = true;
    expect((await GET(req())).status).toBe(200);
    expect(h.selects[0]).toBe(csvColumns(true));
    expect(h.selects[0]).toContain("address_postal_code");
    expect(h.selects[0]).toContain("cns");
    expect(h.selects[0]).not.toMatch(/\*|notes/);
  });

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
    h.logError = { message: "not_allowed", code: "P0001" };
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "access_log_failed" });
  });

  it("a network failure of the log: still no file, but the generic error (b2: only a refusal says 'couldn't record')", async () => {
    h.logError = { message: "TypeError: fetch failed", code: "" };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "generic" });
  });

  it("no patients: just the header, and no log call (126 refuses an empty list)", async () => {
    h.patients = [];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(h.rpc).toEqual([]);
  });

  it("more than 5000 patients: logged in chunks of 5000 (126's cap)", async () => {
    h.patients = Array.from({ length: 5001 }, (_, i) => P(i));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(h.rpc.map((r) => (r.args.p_patient_ids as string[]).length)).toEqual([5000, 1]);
  });

  it("an unknown practice country: no file and nothing logged", async () => {
    country.code = null;
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "country_failed" });
    expect(h.rpc).toEqual([]);
    country.code = "BR";
  });

  it("every page of patients", async () => {
    h.patients = Array.from({ length: 1500 }, (_, i) => P(i));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((h.rpc[0].args.p_patient_ids as string[]).length).toBe(1500);
  });
});
