import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { clientIdFrom, isDuplicateKey, savedBefore } from "@/lib/saveOnce";

// 1.9.0 offline guard PR3, "ghost save" (migration 216, c5's contract): a form
// keeps one id from opening until a confirmed save and sends it with every
// try; a retry after a lost answer finds the first save instead of making a
// second one.

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";

describe("lib/saveOnce", () => {
  it("only a uuid is a client id; 23505 / 23P01 are repeats", async () => {
    expect(clientIdFrom(ID)).toBe(ID);
    expect(clientIdFrom("x")).toBeNull();
    expect(clientIdFrom(null)).toBeNull();
    expect(isDuplicateKey({ code: "23505" })).toBe(true);
    expect(isDuplicateKey({ code: "23P01" })).toBe(true);
    expect(isDuplicateKey({ code: "42501" })).toBe(false);
    expect(await savedBefore(async () => ({ data: { id: ID }, error: null }))).toBe(true);
    expect(await savedBefore(async () => ({ data: null, error: null }))).toBe(false);
    expect(await savedBefore(async () => ({ data: null, error: { code: "42501" } }))).toBe(false);
    expect(await savedBefore(async () => { throw new TypeError("Failed to fetch"); })).toBe(false);
  });
});

// ── The server actions, with a fake database ──
const db = vi.hoisted(() => ({
  insertError: null as null | { code: string; message: string },
  readBack: null as null | { id: string },
  rpcResult: { data: null as unknown, error: null as null | { message: string } },
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true, getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: async () => true }));
vi.mock("@/lib/medicalDocuments", async (orig) => ({ ...(await orig<typeof import("@/lib/medicalDocuments")>()), validateFields: () => null }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "BR" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => { db.rpcs.push({ fn, args }); return db.rpcResult; },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        db.inserts.push({ table, row });
        const res = { data: db.insertError ? null : { id: row.id ?? "server-id" }, error: db.insertError };
        return Object.assign(Promise.resolve(res), { select: () => ({ single: async () => res }) });
      },
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: db.readBack, error: null }) };
        return q;
      },
    }),
  }),
}));

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("records and documents: a direct insert under the form's id", () => {
  beforeEach(() => { db.insertError = null; db.readBack = null; db.inserts.length = 0; db.rpcs.length = 0; });

  it("the record is inserted with the form's id", async () => {
    const { createRecord } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID }))).toEqual({ success: true });
    expect(db.inserts[0].row.id).toBe(ID);
  });

  it("a repeat (23505) that reads back as this doctor's own row is a success; otherwise an error", async () => {
    const { createRecord } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    db.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    db.readBack = { id: ID };
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID }))).toEqual({ success: true });
    db.readBack = null;
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID }))).toHaveProperty("error");
  });

  it("a medical document: the same rule", async () => {
    const { createMedicalDocument } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions");
    const input = { type: "declaration" as const, lang: "pt-BR" as const, fields: { attendedOn: "2026-10-01", from: "09:00", to: "10:00" } as never, body: "Declaro…", clientId: ID };
    db.insertError = { code: "23505", message: "duplicate key" };
    db.readBack = { id: ID };
    const r = await createMedicalDocument("11111111-1111-4111-8111-111111111111", input);
    expect(r).toEqual({ ok: true, data: ID });
    expect(db.inserts[0].row.id).toBe(ID);
  });
});

describe("prescriptions and corrections: the 216 RPCs with p_id", () => {
  beforeEach(() => { db.rpcResult = { data: ID, error: null }; db.rpcs.length = 0; });

  it("create_prescription gets the form's id, the notes and the named medications in one call", async () => {
    const { createPrescription } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    const r = await createPrescription("p1", fd({ client_id: ID, notes: "Após as refeições", name_0: "Dipirona", dosage_0: "500 mg", frequency_0: "6/6h", duration_0: "3 dias", name_1: "" }));
    expect(r).toEqual({ success: true, id: ID });
    expect(db.rpcs).toEqual([{ fn: "create_prescription", args: { p_id: ID, p_patient_id: "p1", p_notes: "Após as refeições", p_items: [{ name: "Dipirona", dosage: "500 mg", frequency: "6/6h", duration: "3 dias" }] } }]);
  });

  it("no medication → medication_required, nothing sent; content_required → medication_required; id_conflict passes through", async () => {
    const { createPrescription } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    expect(await createPrescription("p1", fd({ client_id: ID, name_0: " " }))).toEqual({ error: "medication_required" });
    expect(db.rpcs).toHaveLength(0);
    db.rpcResult = { data: null, error: { message: "content_required" } };
    expect(await createPrescription("p1", fd({ client_id: ID, name_0: "X" }))).toEqual({ error: "medication_required" });
    db.rpcResult = { data: null, error: { message: "id_conflict" } };
    expect(await createPrescription("p1", fd({ client_id: ID, name_0: "X" }))).toEqual({ error: "id_conflict" });
  });

  it("the corrections send p_id (named)", async () => {
    const { addRecordCorrection, addPrescriptionCorrection } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    await addRecordCorrection("r1", "p1", fd({ content: "Corrigido", reason: "erro", client_id: ID }));
    await addPrescriptionCorrection("rx1", "p1", fd({ name_0: "X", reason: "erro", client_id: ID }));
    expect(db.rpcs.map((c) => [c.fn, c.args.p_id])).toEqual([["add_record_correction", ID], ["add_prescription_correction", ID]]);
  });
});

// ── The form: one id per open, the same on a retry, a new one after a save ──
const sent = vi.hoisted(() => ({ calls: [] as FormData[], outcomes: [] as (() => Promise<unknown>)[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));

describe("the record dialog keeps its id across retries", () => {
  afterEach(() => { sent.calls.length = 0; });

  it("a lost answer, then a retry: the same client_id; reopening: a new one", async () => {
    const actions = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    let tries = 0;
    vi.spyOn(actions, "createRecord").mockImplementation(async (_p: string, f: FormData) => {
      sent.calls.push(f);
      if (tries++ === 0) throw new TypeError("Failed to fetch");
      return { success: true } as never;
    });
    const { PatientTabs } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient");
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PatientTabs patient={{ id: "p1", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" } as never} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone="America/Sao_Paulo" recordTemplates={[]} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.tabRecords.replace("{n}", "0") }));
    const openNew = () => fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    openNew();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Retorno" } });
    const save = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.saveRecord })); });
    await save();
    await waitFor(() => expect(sent.calls).toHaveLength(1));
    await save();
    await waitFor(() => expect(sent.calls).toHaveLength(2));
    const first = sent.calls[0].get("client_id");
    expect(clientIdFrom(first)).not.toBeNull();
    expect(sent.calls[1].get("client_id")).toBe(first);
    // Saved: the dialog closes; a new record gets a new id.
    openNew();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Outro" } });
    await save();
    await waitFor(() => expect(sent.calls).toHaveLength(3));
    expect(sent.calls[2].get("client_id")).not.toBe(first);
  });
});
