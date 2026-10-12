import { beforeEach, describe, expect, it, vi } from "vitest";

// 1.9.0 (02, 10-12): es / de / fr / it are hidden until a native review. A
// new document is refused in them; a document already saved in one keeps it.

const inserted: unknown[] = [];
const updated: unknown[] = [];
let savedLanguage = "es";

const db = {
  auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
  from: (table: string) => {
    if (table !== "medical_documents") throw new Error(`unexpected table ${table}`);
    return {
      insert: (row: unknown) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "new-doc" }, error: null }) }) };
      },
      update: (row: unknown) => {
        updated.push(row);
        const q = { eq: () => q, then: (r: (v: { error: null }) => void) => r({ error: null }) };
        return q;
      },
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: { language: savedLanguage }, error: null }) };
        return q;
      },
    };
  },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: async () => true }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "BR" }) }));
vi.mock("@/lib/medicalDocuments", async (orig) => ({
  ...(await orig<typeof import("@/lib/medicalDocuments")>()),
  validateFields: () => null,
}));

const { createMedicalDocument, updateMedicalDocument } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions");

const PATIENT = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const input = (lang: string) => ({ type: "declaration" as const, lang: lang as "en", fields: {} as never, body: "Texto" });

describe("hidden document languages", () => {
  beforeEach(() => {
    inserted.length = 0;
    updated.length = 0;
    savedLanguage = "es";
  });

  it("a new document: pt-BR / en / th are saved; es / de / fr / it are refused before any insert", async () => {
    for (const l of ["pt-BR", "en", "th"]) expect((await createMedicalDocument(PATIENT, input(l))).ok, l).toBe(true);
    for (const l of ["es", "de", "fr", "it"]) expect(await createMedicalDocument(PATIENT, input(l)), l).toEqual({ ok: false, code: "check_failed" });
    expect(inserted).toHaveLength(3);
  });

  it("a document already in Spanish can still be edited in Spanish, but not moved to another hidden language", async () => {
    expect((await updateMedicalDocument(DOC, PATIENT, input("es"))).ok).toBe(true);
    expect(await updateMedicalDocument(DOC, PATIENT, input("fr"))).toEqual({ ok: false, code: "check_failed" });
    expect(updated).toHaveLength(1);
  });
});
