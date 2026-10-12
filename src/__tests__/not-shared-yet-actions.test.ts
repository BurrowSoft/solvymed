import { beforeEach, describe, expect, it, vi } from "vitest";

// "Not shared yet" (1.9.0 item 1.4, migration 220), the server side: the
// intent goes with the save only with the box on and the condition met;
// list_unshared / mark_share_intent read and record it; nothing is sent
// while it's off (before 220 is applied, the column and RPCs don't exist).

const h = vi.hoisted(() => ({ live: true, recording: false, rpcData: null as unknown, rpcs: [] as { fn: string; args: Record<string, unknown> }[], inserts: [] as Record<string, unknown>[] }));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "not-shared-marker-live" ? h.live : id === "share-intent-recording" ? h.recording : real.conditionMet(id as never)) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true, getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: async () => true }));
vi.mock("@/lib/practiceCountry", () => ({ lookupPracticeCountry: async () => ({ ok: true, country: "BR" }) }));
vi.mock("@/lib/medicalDocuments", async (orig) => ({ ...(await orig<typeof import("@/lib/medicalDocuments")>()), validateFields: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => { h.rpcs.push({ fn, args }); return { data: h.rpcData ?? (fn === "create_prescription" ? "rx-1" : null), error: null }; },
    from: () => ({
      insert: (row: Record<string, unknown>) => { h.inserts.push(row); const res = { data: { id: "d-1" }, error: null }; return Object.assign(Promise.resolve(res), { select: () => ({ single: async () => res }) }); },
    }),
  }),
}));

import { createMedicalDocument } from "@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions";
import { createPrescription } from "@/app/[locale]/(site)/dashboard/(gated)/patients/actions";
import { listUnshared, markShareIntent } from "@/app/[locale]/(site)/dashboard/(gated)/patients/share-intent-actions";

const P = "11111111-1111-4111-8111-111111111111";
const D = "22222222-2222-4222-8222-222222222222";
const doc = { type: "certificate" as const, lang: "pt-BR" as const, fields: { variant: "attendance", date: "2026-10-12", from: "09:00", to: "10:00", includeCid: false } as never, body: "Atesto." };

beforeEach(() => { h.rpcs = []; h.inserts = []; h.live = true; h.recording = false; h.rpcData = null; });

describe("Not shared yet: the server side", () => {
  it("a new document saved with the box on carries the intent; off, or before 220 is live, it doesn't", async () => {
    await createMedicalDocument(P, { ...doc, share: true });
    expect(h.inserts[0]).toHaveProperty("share_intended_at");
    await createMedicalDocument(P, { ...doc, share: false });
    expect(h.inserts[1]).not.toHaveProperty("share_intended_at");
    h.live = false;
    await createMedicalDocument(P, { ...doc, share: true });
    expect(h.inserts[2]).not.toHaveProperty("share_intended_at");
  }, 30_000);

  it("a new prescription: p_share only with the box on and 220 live", async () => {
    const fd = (share: boolean) => { const f = new FormData(); f.append("name_0", "Dipirona"); if (share) f.set("share", "1"); return f; };
    const call = () => h.rpcs.find((r) => r.fn === "create_prescription")?.args;
    await createPrescription(P, fd(true));
    expect(call()).toMatchObject({ p_share: true });
    h.rpcs = [];
    await createPrescription(P, fd(false));
    expect(call()).not.toHaveProperty("p_share");
    h.rpcs = []; h.live = false;
    await createPrescription(P, fd(true));
    expect(call()).not.toHaveProperty("p_share");
  }, 30_000);

  it("list_unshared → keys (unknown sources dropped); mark_share_intent with its source and id; nothing at all while off", async () => {
    h.rpcData = [{ source: "prescription", source_id: D }, { source: "bogus", source_id: D }];
    expect(await listUnshared(P)).toEqual([`prescription:${D}`]);
    h.rpcData = null;
    expect(await markShareIntent("medical_document", D)).toEqual({ ok: true });
    expect(h.rpcs.at(-1)).toEqual({ fn: "mark_share_intent", args: { p_source: "medical_document", p_id: D } });
    h.live = false; h.rpcs = [];
    expect(await listUnshared(P)).toEqual([]);
    expect(await markShareIntent("prescription", D)).toEqual({ ok: false });
    expect(h.rpcs).toEqual([]);
  });

  it("recording alone (220 applied, the mark not shipped): saves carry the intent, but nothing is listed or marked", async () => {
    h.live = false; h.recording = true;
    await createMedicalDocument(P, { ...doc, share: true });
    expect(h.inserts[0]).toHaveProperty("share_intended_at");
    const f = new FormData(); f.append("name_0", "Dipirona"); f.set("share", "1");
    await createPrescription(P, f);
    expect(h.rpcs.find((r) => r.fn === "create_prescription")?.args).toMatchObject({ p_share: true });
    h.rpcData = [{ source: "prescription", source_id: D }];
    expect(await listUnshared(P)).toEqual([]);
    expect(await markShareIntent("prescription", D)).toEqual({ ok: false });
  }, 30_000);
});
