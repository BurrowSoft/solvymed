// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { failOpenRules, fieldsFor, filled, missingRequired, readPatientFieldRules, ruleOf } from "@/lib/patientFields";

// 1.8.0 C1 (migration 207, cf): which patient details a practice asks for.

describe("the rules", () => {
  it("defaults: a missing key is optional, except Brazil's RG (hidden); CNS is Brazil's", () => {
    expect(ruleOf({}, "email", "BR")).toBe("optional");
    expect(ruleOf({}, "rg_passport", "BR")).toBe("hidden");
    expect(ruleOf({}, "rg_passport", "TH")).toBe("optional");
    expect(ruleOf({ email: "required" }, "email", "BR")).toBe("required");
    expect(fieldsFor("BR")).toContain("cns");
    expect(fieldsFor("TH")).not.toContain("cns");
    expect(failOpenRules("BR").rg_passport).toBe("hidden");
  });

  it("reading them fails open (before 207, an error, odd values)", async () => {
    const db = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });
    expect(await readPatientFieldRules(db(null, { message: "no function" }), "p")).toBeNull();
    expect(await readPatientFieldRules(db({ email: "required", bogus: "required", sex: "weird" }), "p")).toEqual({ email: "required" });
  });

  it("Thailand: a passport fills a required national ID; Brazil: CPF only (cf)", () => {
    expect(filled("national_id", { passport_number: "AA123" }, "TH")).toBe(true);
    expect(filled("national_id", { passport_number: "AA123" }, "BR")).toBe(false);
    expect(filled("national_id", { cpf: "123" }, "BR")).toBe(true);
    expect(filled("address", { address_city: "Recife" }, "BR")).toBe(true);
  });

  it("a new patient: every required empty field blocks", () => {
    const rules = { email: "required", birth_date: "required" } as const;
    expect(missingRequired(rules, { email: "a@b.c" }, "BR")).toEqual({ blocking: ["birth_date"], note: [] });
  });

  it("an edit: clearing a required field blocks; one already empty is a note", () => {
    const rules = { email: "required", birth_date: "required" } as const;
    const before = { email: "a@b.c", birth_date: "" };
    expect(missingRequired(rules, { email: "", birth_date: "" }, "BR", before)).toEqual({ blocking: ["email"], note: ["birth_date"] });
    expect(missingRequired(rules, { email: "a@b.c", birth_date: "" }, "BR", before)).toEqual({ blocking: [], note: ["birth_date"] });
  });
});

// The edit writes only what the form showed: a hidden field keeps its value.
const h = vi.hoisted(() => ({ update: null as null | Record<string, unknown>, rules: null as unknown, before: {} as Record<string, unknown> }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1", isActiveProfessional: async () => true, isLockedOut: async () => false }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "BR" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string) => (fn === "get_patient_fields" ? { data: h.rules, error: h.rules ? null : { message: "x" } } : { data: null, error: null }),
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: h.before, error: null }),
        update: (row: Record<string, unknown>) => { h.update = row; const u = { eq: () => u, then: (r: (v: unknown) => void) => r({ error: null }) }; return u; },
      };
      return chain;
    },
  }),
}));

import { updatePatient } from "@/app/[locale]/(site)/dashboard/(gated)/patients/actions";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  fd.set("id_kind", "BR");
  fd.set("full_name", "Ana");
  fd.set("phone", "11999990000");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("saving an edited patient", () => {
  beforeEach(() => { h.update = null; h.rules = null; h.before = {}; });

  it("a field the form didn't show isn't written (hidden keeps what's saved)", async () => {
    await updatePatient("pat-1", form({ email: "a@b.c" }));
    expect(h.update).toMatchObject({ full_name: "Ana", email: "a@b.c" });
    for (const k of ["profession", "emergency_phone", "convenio_type", "birth_date", "sex", "rg", "cpf"]) expect(h.update && k in h.update, k).toBe(false);
  });

  it("clearing a required detail that had a value is refused", async () => {
    h.rules = { profession: "required" };
    h.before = { profession: "Engenheira" };
    expect(await updatePatient("pat-1", form({ profession: "" }))).toEqual({ error: "missing_fields", fields: ["profession"] });
    expect(h.update).toBeNull();
  });

  it("a required detail already empty doesn't block", async () => {
    h.rules = { profession: "required" };
    h.before = { profession: null };
    expect(await updatePatient("pat-1", form({}))).toEqual({ success: true });
  });
});
