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
    // The first import of the actions module is slow on a busy runner (it
    // timed out once at the default 5 s); the later tests reuse it.
  }, 30_000);

  it("a repeat (23505) that reads back as this doctor's own row is a success; otherwise an error", async () => {
    const { createRecord } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    db.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    db.readBack = { id: ID, content: "Retorno", sections: null } as never;
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID }))).toEqual({ success: true });
    db.readBack = null;
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID }))).toHaveProperty("error");
  });

  it("a medical document: the same rule", async () => {
    const { createMedicalDocument } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions");
    const input = { type: "declaration" as const, lang: "pt-BR" as const, fields: { attendedOn: "2026-10-01", from: "09:00", to: "10:00" } as never, body: "Declaro…", clientId: ID };
    db.insertError = { code: "23505", message: "duplicate key" };
    db.readBack = { id: ID, body: input.body, fields: input.fields } as never;
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
  afterEach(() => { sent.calls.length = 0; vi.restoreAllMocks(); });

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

// ── A retry after the doctor changed the form (02 "(c) everywhere", c5) ──
import { isRetry, sameDocument, samePrescription, sameRecord } from "@/lib/saveOnce";

describe("comparing the stored version with the retry", () => {
  it("records, prescriptions, documents: trimmed text, sections/fields as data, items as a list", () => {
    expect(isRetry("1")).toBe(false);
    expect(isRetry("2")).toBe(true);
    expect(sameRecord({ content: "Retorno ", sections: null }, { content: "Retorno" })).toBe(true);
    expect(sameRecord({ content: "Retorno" }, { content: "Retorno, febre" })).toBe(false);
    expect(sameRecord({ content: "x", sections: [{ title: "A", text: "1" }] }, { content: "x", sections: [{ text: "1", title: "A" }] })).toBe(true);
    expect(sameRecord({ content: "x", correction_reason: "erro" }, { content: "x", reason: "outro" })).toBe(false);
    const item = { name: "Dipirona", dosage: "1 cp", frequency: "6/6 h", duration: "3 dias" };
    expect(samePrescription({ notes: null, prescription_items: [item] }, { notes: "", items: [{ ...item, name: "Dipirona " }] })).toBe(true);
    expect(samePrescription({ notes: null, prescription_items: [item] }, { notes: null, items: [{ ...item, duration: "5 dias" }] })).toBe(false);
    expect(samePrescription({ notes: null, prescription_items: [item] }, { notes: null, items: [item, item] })).toBe(false);
    expect(sameDocument({ body: "Atesto…", fields: { days: 2, date: "2026-10-07" } }, { body: "Atesto… ", fields: { date: "2026-10-07", days: 2 } })).toBe(true);
    expect(sameDocument({ body: "Atesto…", fields: { days: 2 } }, { body: "Atesto…", fields: { days: 3 } })).toBe(false);
  });
});

describe("the actions on a changed retry", () => {
  beforeEach(() => { db.insertError = null; db.readBack = null; db.inserts.length = 0; db.rpcs.length = 0; db.rpcResult = { data: ID, error: null }; });

  it("a record: the stored first save differs → alreadySavedChanged; equal → a plain success", async () => {
    const { createRecord } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    db.insertError = { code: "23505", message: "duplicate key" };
    db.readBack = { id: ID, content: "Retorno", sections: null } as never;
    expect(await createRecord("p1", fd({ content: "Retorno, febre", client_id: ID, client_try: "2" }))).toEqual({ success: true, alreadySavedChanged: true });
    expect(await createRecord("p1", fd({ content: "Retorno", client_id: ID, client_try: "2" }))).toEqual({ success: true });
  });

  it("a prescription retry is read back and compared; a first try isn't", async () => {
    const { createPrescription } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    db.readBack = { notes: null, prescription_items: [{ name: "Dipirona", dosage: "", frequency: "", duration: "" }] } as never;
    expect(await createPrescription("p1", fd({ client_id: ID, client_try: "2", name_0: "Amoxicilina" }))).toEqual({ success: true, id: ID, alreadySavedChanged: true });
    expect(await createPrescription("p1", fd({ client_id: ID, client_try: "2", name_0: "Dipirona" }))).toEqual({ success: true, id: ID });
    expect(await createPrescription("p1", fd({ client_id: ID, client_try: "1", name_0: "Amoxicilina" }))).toEqual({ success: true, id: ID });
  });

  it("a medical document: a changed retry → already_saved_changed (the page shows the stored one)", async () => {
    const { createMedicalDocument } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions");
    db.insertError = { code: "23505", message: "duplicate key" };
    db.readBack = { id: ID, body: "Atesto 2 dias", fields: {} } as never;
    const input = { type: "declaration" as const, lang: "pt-BR" as const, fields: {} as never, clientId: ID, clientTry: 2 };
    expect(await createMedicalDocument("11111111-1111-4111-8111-111111111111", { ...input, body: "Atesto 3 dias" })).toEqual({ ok: false, code: "already_saved_changed" });
    expect(await createMedicalDocument("11111111-1111-4111-8111-111111111111", { ...input, body: "Atesto 2 dias" })).toEqual({ ok: true, data: ID });
  });
});

describe("the record dialog on a changed retry", () => {
  afterEach(() => { sent.calls.length = 0; vi.restoreAllMocks(); });

  it("lost answer, the text edited, Save again: the dialog closes and the message says the saved version stands", async () => {
    const actions = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/actions");
    let tries = 0;
    vi.spyOn(actions, "createRecord").mockImplementation(async (_p: string, f: FormData) => {
      sent.calls.push(f);
      if (tries++ === 0) throw new TypeError("Failed to fetch");
      return { success: true, alreadySavedChanged: true } as never;
    });
    const { PatientTabs } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient");
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PatientTabs patient={{ id: "p1", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" } as never} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone="America/Sao_Paulo" recordTemplates={[]} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.tabRecords.replace("{n}", "0") }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Retorno" } });
    const save = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.saveRecord })); });
    await save();
    await waitFor(() => expect(sent.calls).toHaveLength(1));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Retorno, febre" } });
    await save();
    await waitFor(() => expect(sent.calls).toHaveLength(2));
    expect(sent.calls.map((f) => f.get("client_try"))).toEqual(["1", "2"]);
    expect(sent.calls[1].get("client_id")).toBe(sent.calls[0].get("client_id"));
    expect(await screen.findByText(pt.save.alreadySavedChanged)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: pt.patientDetail.saveRecord })).toBeNull();
  });
});
