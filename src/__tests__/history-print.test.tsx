import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_TEMPLATE } from "@/lib/prescriptionDoc";
import { HistoryDocument, type HistoryLabels } from "@/app/[locale]/(site)/dashboard/patients/[id]/history/print/HistoryDocument";

// The website's patient history print view (Help P8): the app's export,
// every record and prescription, doctor-only, never partial.

const labels: HistoryLabels = {
  title: "Histórico clínico", medicalRecords: "Prontuário", prescriptions: "Receitas", noRecords: "Nenhum registro.",
  noPrescriptions: "Nenhuma receita.", medication: "Medicamento", dosage: "Dose", frequency: "Frequência", duration: "Duração",
  corrected: "(corrigido)", footer: "SolvyMed — Gestão de clínicas", exportedBy: "Exportado por Dra. Ana · Clínica X em 2 de outubro de 2026",
};

describe("HistoryDocument", () => {
  it("lists records and prescriptions with counts, corrections, details and the signature line", () => {
    const { container } = render(
      <HistoryDocument
        template={DEFAULT_TEMPLATE} labels={labels} patientName="Maria Silva"
        detailLines={["Nascimento: 01/02/1980 (46 anos)", "CPF: 123.456.789-00"]}
        records={[
          { id: "r2", date: "02/10/2026", time: "10:00", content: "Retorno <script>x</script>", corrected: false },
          { id: "r1", date: "01/10/2026", time: "09:00", content: "Primeira consulta", corrected: true },
        ]}
        prescriptions={[{ id: "x1", date: "01/10/2026", notes: "Após as refeições", corrected: false, items: [{ name: "Dipirona", dosage: "1 cp", frequency: "6/6 h", duration: "3 dias" }] }]}
        signerName="Dra. Ana" signerRegistration="CRM 1/SP"
      />,
    );
    expect(screen.getByRole("heading", { name: "Histórico clínico" })).toBeTruthy();
    expect(container.textContent).toContain("Prontuário (2)");
    expect(container.textContent).toContain("Receitas (1)");
    expect(container.textContent).toContain("01/10/2026 09:00 (corrigido)");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Retorno <script>x</script>");
    expect(container.textContent).toContain("CPF: 123.456.789-00");
    expect(container.textContent).toContain("Dipirona");
    expect(container.textContent).toContain("Exportado por Dra. Ana · Clínica X");
    expect(container.textContent).toContain("CRM 1/SP");
  });

  it("says when there's nothing", () => {
    const { container } = render(
      <HistoryDocument template={DEFAULT_TEMPLATE} labels={labels} patientName="Maria" detailLines={[]} records={[]} prescriptions={[]} signerName="Dra. Ana" signerRegistration={null} />,
    );
    expect(container.textContent).toContain("Nenhum registro.");
    expect(container.textContent).toContain("Nenhuma receita.");
  });
});

const h = vi.hoisted(() => ({
  role: "professional",
  patient: { id: "p-1", full_name: "Maria", cpf: "123", th_national_id: "999", birth_date: null, phone: null, sex: "female" } as unknown,
  recordsError: null as unknown,
  filters: [] as [string, string, unknown][],
  rpcs: [] as unknown[],
  // The access-log write fails: no document (UX 36, fail closed).
  logFails: false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: unknown) => { h.rpcs.push({ fn, args }); return { data: null, error: h.logFails ? { message: "not_allowed" } : null }; },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { h.filters.push([table, c, v]); return q; };
      q.order = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(
        table === "medical_records" ? { data: h.recordsError ? null : [{ id: "r1", date: "2026-10-01", time: "09:00", content: "x", corrects_id: null }, { id: "r2", date: "2026-10-02", time: "10:00", content: "y", corrects_id: "r1" }], error: h.recordsError }
          : table === "prescriptions" ? { data: [{ id: "x1", date: "2026-10-01", notes: null, corrects_id: null, prescription_items: [] }], error: null }
          : { data: [], error: null },
      ).then(res);
      q.maybeSingle = async () => ({
        data: table === "user_roles" ? { role: h.role } : table === "patients" ? h.patient : table === "professionals" ? { full_name: "Dra. Ana", clinic_name: null, professional_registration: null } : null,
        error: null,
      });
      return q;
    },
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).join("|")}` : k) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); },
}));
const country = vi.hoisted(() => ({ code: "BR" as string | null }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => (country.code ? { ok: true, country: country.code } : { ok: false, code: "exception" }) }));
vi.mock("@/components/PrintToolbar", () => ({ PrintToolbar: () => null }));
vi.mock("@/lib/clinicTime", () => ({ getClinicTimeZone: async () => "America/Sao_Paulo" }));

import HistoryPage from "@/app/[locale]/(site)/dashboard/patients/[id]/history/print/page";

describe("history print page", () => {
  const params = Promise.resolve({ locale: "pt-BR", id: "p-1" });
  beforeEach(() => {
    h.role = "professional"; h.recordsError = null; h.filters = []; h.rpcs = []; h.logFails = false;
    h.patient = { id: "p-1", full_name: "Maria", cpf: "123", th_national_id: "999", birth_date: null, phone: null, sex: "female" };
  });

  it("a secretary never gets it; only this doctor's patient", async () => {
    h.role = "secretary";
    await expect(HistoryPage({ params })).rejects.toThrow("NOT_FOUND");
    h.role = "professional";
    h.patient = null;
    await expect(HistoryPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(h.filters).toContainEqual(["patients", "professional_id", "doc-1"]);
  });

  it("never prints a partial history", async () => {
    h.recordsError = { message: "boom" };
    await expect(HistoryPage({ params })).rejects.toThrow("history_load_failed");
    expect(h.rpcs).toEqual([]);
  });

  it("logs every entry printed (like the app's export) and shows only the practice country's IDs", async () => {
    const el = await HistoryPage({ params });
    const { container } = render(el);
    const log = (args: Record<string, string>) => ({ fn: "log_record_access", args: { p_patient_id: "p-1", ...args } });
    expect(h.rpcs).toEqual([
      log({ p_kind: "patient" }),
      log({ p_kind: "record", p_object_ref: "r1" }),
      log({ p_kind: "record", p_object_ref: "r2" }),
      log({ p_kind: "prescription", p_object_ref: "x1" }),
    ]);
    expect(container.textContent).toContain("corrected");
    expect(container.textContent).toContain("cpf: 123");
    expect(container.textContent).not.toContain("999");
  });

  it("no document when the access can't be recorded (fail closed)", async () => {
    h.logFails = true;
    const { container } = render(await HistoryPage({ params }));
    expect(container.querySelector("#print-doc")).toBeNull();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("accessLogFailed");
  });

  it("an unknown practice country: an error, not a guessed calendar, and no access logged", async () => {
    country.code = null;
    const { container } = render(await HistoryPage({ params }));
    expect(container.querySelector("#print-doc")).toBeNull();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("countryFailed");
    expect(h.rpcs).toEqual([]);
    country.code = "BR";
  });
});
