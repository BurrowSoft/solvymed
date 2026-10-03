import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// The website's recibo (Help G5; UX 36): the doctor AND the secretary, the
// practice's header even for a secretary, practice-country dates and money,
// and no unnumbered recibo for a Thai practice.

const h = vi.hoisted(() => ({
  toolbar: [] as { printable?: boolean }[],
  profId: "doc-1" as string | null,
  appt: null as Record<string, unknown> | null,
  patient: { full_name: "Maria Silva", cpf: "123.456.789-00", passport_number: "X1" } as unknown,
  country: "BR" as string | null,
  registration: null as string | null,
  cnpj: "12.345.678/0001-90" as string | null,
  headerFor: [] as string[],
  filters: [] as [string, string, unknown][],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "sec-1" } } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { h.filters.push([table, c, v]); return q; };
      q.maybeSingle = async () => ({ data: table === "appointments" ? h.appt : table === "patients" ? h.patient : null, error: null });
      return q;
    },
  }),
}));
vi.mock("@/lib/effectiveProfId", () => ({ getEffectiveProfId: async () => h.profId }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => (h.country ? { ok: true, country: h.country } : { ok: false, code: "exception" }) }));
vi.mock("@/lib/practiceHeader", () => ({
  readPracticeHeader: async (id: string) => {
    h.headerFor.push(id);
    return { fullName: "Dra. Ana Souza", registration: h.registration, specialty: "Clínica geral", clinicName: "Clínica Bem-Estar", clinicCnpj: h.cnpj, address: "Rua A, 10", city: "São Paulo", state: "SP", template: { primary_color: "#0f766e" } };
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); },
}));
vi.mock("@/components/PrintToolbar", () => ({ PrintToolbar: (p: { printable?: boolean }) => { h.toolbar.push(p); return null; } }));

import ReceiptPage from "@/app/[locale]/(site)/dashboard/(gated)/payments/[apptId]/receipt/page";
import { RECEITA_SAUDE_NOTE } from "@/app/[locale]/(site)/dashboard/(gated)/payments/[apptId]/receipt/ReceiptDocument";

const APPT = "abcdef12-1111-4222-8333-444455556666";
const params = Promise.resolve({ locale: "pt-BR", apptId: APPT });
beforeEach(() => {
  h.profId = "doc-1"; h.country = "BR"; h.headerFor = []; h.filters = [];
  h.registration = null; h.cnpj = "12.345.678/0001-90";
  h.patient = { full_name: "Maria Silva", cpf: "123.456.789-00", passport_number: "X1" };
  h.appt = {
    id: APPT, professional_id: "doc-1", patient_id: "p-1", patient_name: "Maria Silva", date: "2026-10-01", start_time: "09:05:00",
    consultation_type: "Consulta", type: "in-person", payment_amount: 250, payment_type: "private", payment_status: "paid", status: "completed",
    extra_items: [{ name: "Curativo", price: 40 }],
  };
});

describe("recibo print page", () => {
  // d7: the stored type key ("Consultation") was printed raw. A built-in
  // type goes through consultType (the mock returns the key), a clinic's
  // own procedure stays as written.
  it("the service: a built-in type translated, a procedure name as written", async () => {
    h.appt = { ...h.appt, consultation_type: "Consultation" };
    let text = render(await ReceiptPage({ params })).container.textContent ?? "";
    expect(text).toContain("consultation");
    expect(text).not.toContain("Consultation");
    h.appt = { ...h.appt, consultation_type: "Limpeza de pele" };
    text = render(await ReceiptPage({ params })).container.textContent ?? "";
    expect(text).toContain("Limpeza de pele");
  });

  it("a secretary's recibo carries the practice's header, the patient's CPF, the number and the total", async () => {
    const { container } = render(await ReceiptPage({ params }));
    const text = container.textContent ?? "";
    expect(h.headerFor).toEqual(["doc-1"]);
    expect(h.filters).toContainEqual(["appointments", "professional_id", "doc-1"]);
    expect(text).toContain("Dra. Ana Souza — Clínica geral");
    expect(text).toContain("Clínica Bem-Estar · CNPJ 12.345.678/0001-90");
    expect(text).toContain("Rua A, 10, São Paulo, SP");
    expect(text).toContain("cpf: 123.456.789-00");
    expect(text).toContain("#20261001-ABCDEF");
    expect(text).toContain("01/10/2026");
    expect(text).toContain("inPerson · 09:05");
    expect(text).toContain("Curativo");
    expect(text).toMatch(/R\$\s?290,00/);
    expect(text).toContain("privatePay");
    expect(text).toContain("paid");
  });

  it("the council registration sits after the doctor's name; a clinic with a CNPJ gets no Receita Saúde note", async () => {
    h.registration = "CRM 12345/SP";
    const { container } = render(await ReceiptPage({ params }));
    const text = container.textContent ?? "";
    expect(text).toContain("Dra. Ana Souza · CRM 12345/SP — Clínica geral");
    expect(text).not.toContain("Receita Saúde");
  });

  it("a Brazilian doctor without a CNPJ: the Receita Saúde note, in Portuguese whatever the UI language", async () => {
    h.cnpj = null;
    const { container } = render(await ReceiptPage({ params: Promise.resolve({ locale: "en", apptId: APPT }) }));
    const note = [...container.querySelectorAll("p[lang='pt-BR']")].find(p => p.textContent?.includes("Receita Saúde"));
    expect(note?.textContent).toBe(RECEITA_SAUDE_NOTE);
    expect(container.textContent).not.toContain("CNPJ");
  });

  it("outside Brazil: never the Receita Saúde note", async () => {
    h.country = "ZZ"; h.cnpj = null;
    const { container } = render(await ReceiptPage({ params }));
    expect(container.textContent).not.toContain("Receita Saúde");
  });

  it("another practice's appointment (or none) → 404; blocked time is never a recibo", async () => {
    h.appt = null;
    await expect(ReceiptPage({ params })).rejects.toThrow("NOT_FOUND");
    h.appt = { id: APPT, status: "blocked" };
    await expect(ReceiptPage({ params })).rejects.toThrow("NOT_FOUND");
    h.profId = null;
    await expect(ReceiptPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(h.headerFor).toEqual([]);
  });

  it("a Thai practice gets the hint, never an unnumbered recibo", async () => {
    h.country = "TH";
    const { container } = render(await ReceiptPage({ params }));
    expect(container.textContent).toContain("receiptThaiHint");
    expect(container.querySelector("#print-doc")).toBeNull();
    // Nothing to print: only the way back, no Print button (3e).
    expect(h.toolbar.at(-1)).toMatchObject({ printable: false });
    expect(h.headerFor).toEqual([]);
  });

  it("outside Brazil: no CNPJ, the passport line", async () => {
    h.country = "ZZ";
    const { container } = render(await ReceiptPage({ params }));
    const text = container.textContent ?? "";
    expect(text).not.toContain("CNPJ");
    expect(text).not.toContain("cpf");
    expect(text).toContain("passportOrId: X1");
  });

  it("an unknown practice country: an error, never a guessed Brazilian recibo", async () => {
    h.country = null;
    const { container } = render(await ReceiptPage({ params }));
    expect(container.querySelector("#print-doc")).toBeNull();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("countryFailed");
    expect(h.headerFor).toEqual([]);
  });
});
