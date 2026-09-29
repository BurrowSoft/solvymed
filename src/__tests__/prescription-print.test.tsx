import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cssColor, safeLogoUrl, toDocTemplate, DEFAULT_TEMPLATE } from "@/lib/prescriptionDoc";
import { PrescriptionDocument, type RxDocLabels } from "@/app/[locale]/(site)/dashboard/patients/[id]/prescriptions/[rxId]/print/PrescriptionDocument";

// The website's prescription print view (Help P6): the app's PDF layout,
// a blank line to sign by hand (UX 36), doctor-only.

const labels: RxDocLabels = {
  title: "Receita", patient: "Paciente", date: "Data", medications: "Medicamentos", medication: "Medicamento",
  dosage: "Dose", frequency: "Frequência", duration: "Duração", notes: "Observações", footer: "SolvyMed — Gestão de clínicas", corrected: "(corrigido)",
};

describe("template guards", () => {
  it("keeps only #hex colours and https logos", () => {
    expect(cssColor("#12ab34", "#000")).toBe("#12ab34");
    expect(cssColor("red;background:url(x)", "#000")).toBe("#000");
    expect(safeLogoUrl("https://x.supabase.co/logo.png")).toBe("https://x.supabase.co/logo.png");
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(safeLogoUrl("http://x/logo.png")).toBeNull();
    expect(toDocTemplate(null)).toEqual(DEFAULT_TEMPLATE);
    expect(toDocTemplate({ primary_color: "#fff", accent_color: "nope", header_text: "  ", footer_text: "Clínica X" }))
      .toEqual({ primaryColor: "#fff", accentColor: "#E8F4FE", logoUrl: null, headerText: null, footerText: "Clínica X" });
  });
});

describe("PrescriptionDocument", () => {
  const doc = (over: Partial<Parameters<typeof PrescriptionDocument>[0]> = {}) => render(
    <PrescriptionDocument
      template={DEFAULT_TEMPLATE} labels={labels} patientName="Maria <b>Silva</b>" date="01/10/2026" corrected={false}
      items={[{ name: "Amoxicilina 500 mg", dosage: "1 cápsula", frequency: "8/8 h", duration: "7 dias" }]}
      notes={null} signerName="Dra. Ana Souza" signerRegistration="CRM 12345/SP" {...over}
    />,
  );

  it("lays out the patient, date, medications, a blank signature line with name + registration", () => {
    const { container } = doc();
    expect(screen.getByRole("heading", { name: "Receita" })).toBeTruthy();
    // Typed text is text, never markup.
    expect(screen.getAllByText("Maria <b>Silva</b>").length).toBeGreaterThan(0);
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("Amoxicilina 500 mg")).toBeTruthy();
    expect(container.textContent).toContain("Dra. Ana Souza");
    expect(container.textContent).toContain("CRM 12345/SP");
    // No drawn signature on the website.
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("SolvyMed — Gestão de clínicas");
  });

  it("marks a corrected prescription, shows notes, the template's header/footer and logo", () => {
    const { container } = doc({
      corrected: true, notes: "Tomar após as refeições",
      template: { ...DEFAULT_TEMPLATE, headerText: "Clínica Bem-Estar", footerText: "Rua A, 10", logoUrl: "https://x/logo.png" },
    });
    expect(container.textContent).toContain("01/10/2026 (corrigido)");
    expect(container.textContent).toContain("Observações: Tomar após as refeições");
    expect(screen.getByText("Clínica Bem-Estar")).toBeTruthy();
    expect(container.textContent).toContain("Rua A, 10");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x/logo.png");
  });

  it("leaves the registration out when there is none", () => {
    const { container } = doc({ signerRegistration: null });
    expect(container.textContent).toContain("Dra. Ana Souza");
    expect(container.textContent).not.toContain("CRM");
  });
});

// The page: doctor-only, this practice's patient, the access log.
const h = vi.hoisted(() => ({
  role: "professional",
  patient: { id: "p-1", full_name: "Maria" } as unknown,
  rx: { id: "rx-1", date: "2026-10-01", notes: null, prescription_items: [] } as unknown,
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
      q.limit = async () => ({ data: [], error: null });
      q.maybeSingle = async () => ({
        data: table === "user_roles" ? { role: h.role } : table === "patients" ? h.patient : table === "prescriptions" ? h.rx : null,
        error: null,
      });
      return q;
    },
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); },
}));
const country = vi.hoisted(() => ({ code: "BR" }));
vi.mock("@/lib/practiceCountry", () => ({ getPracticeCountry: async () => country.code }));
vi.mock("@/components/PrintToolbar", () => ({ PrintToolbar: () => null }));

import PrintPage from "@/app/[locale]/(site)/dashboard/patients/[id]/prescriptions/[rxId]/print/page";
import { docDate, docTime, docToday } from "@/lib/prescriptionDoc";

// Printed dates follow the PRACTICE's country, not the screen (UX 36).
describe("document dates", () => {
  it("dd/mm/yyyy, the Buddhist era for a Thai practice", () => {
    expect(docDate("BR", "2026-10-01")).toBe("01/10/2026");
    expect(docDate("TH", "2026-10-01")).toBe("01/10/2569");
    expect(docDate("ZZ", "2026-10-01")).toBe("01/10/2026");
    expect(docTime("9:05:00")).toBe("09:05");
    // 02:30 UTC on Oct 2 is still Oct 1 in São Paulo.
    expect(docToday("BR", "America/Sao_Paulo", new Date("2026-10-02T02:30:00Z"))).toBe("01/10/2026");
    expect(docToday("TH", "Asia/Bangkok", new Date("2026-10-02T02:30:00Z"))).toBe("02/10/2569");
  });

  it("the print page uses the practice's calendar whatever the UI language", async () => {
    country.code = "TH";
    const { container } = render(await PrintPage({ params: Promise.resolve({ locale: "en", id: "p-1", rxId: "rx-1" }) }));
    expect(container.textContent).toContain("01/10/2569");
    country.code = "BR";
  });
});

describe("print page", () => {
  const params = Promise.resolve({ locale: "pt-BR", id: "p-1", rxId: "rx-1" });
  beforeEach(() => { h.role = "professional"; h.patient = { id: "p-1", full_name: "Maria" }; h.rx = { id: "rx-1", date: "2026-10-01", notes: null, prescription_items: [] }; h.filters = []; h.rpcs = []; h.logFails = false; });

  it("a secretary never gets it", async () => {
    h.role = "secretary";
    await expect(PrintPage({ params })).rejects.toThrow("NOT_FOUND");
  });

  it("only this doctor's patient, and the prescription must be that patient's", async () => {
    h.patient = null;
    await expect(PrintPage({ params })).rejects.toThrow("NOT_FOUND");
    h.patient = { id: "p-1", full_name: "Maria" };
    h.rx = null;
    await expect(PrintPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(h.filters).toEqual(expect.arrayContaining([["patients", "professional_id", "doc-1"], ["prescriptions", "patient_id", "p-1"]]));
  });

  it("logs the prescription access", async () => {
    await PrintPage({ params });
    expect(h.rpcs).toEqual([{ fn: "log_record_access", args: { p_patient_id: "p-1", p_kind: "prescription", p_object_ref: "rx-1" } }]);
  });

  it("no document when the access can't be recorded (fail closed)", async () => {
    h.logFails = true;
    const { container } = render(await PrintPage({ params }));
    expect(container.querySelector("#print-doc")).toBeNull();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("accessLogFailed");
  });
});
