import { describe, expect, it, vi, beforeEach } from "vitest";

// 196 on the website: the doctor's upload is registered through the
// patient-document function (it reads the real format first and removes a
// refused file itself), and sharing a never-checked file asks the function
// to check it first; a file that isn't a PDF/JPG/PNG/HEIC stays internal.

const h = vi.hoisted(() => ({
  fn: [] as Record<string, unknown>[],
  fnAnswer: [] as ({ ok: true; data: unknown } | { ok: false; code: string })[],
  rpc: [] as { name: string; args: unknown }[],
  rpcAnswer: [] as { error: { message: string } | null }[],
  removed: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/patientDocumentFn", () => ({
  patientDocumentFn: vi.fn(async (_s: unknown, body: Record<string, unknown>) => { h.fn.push(body); return h.fnAnswer.shift() ?? { ok: true, data: {} }; }),
}));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: vi.fn(async () => true) }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "doc" } } }) },
    rpc: vi.fn(async (name: string, args: unknown) => { h.rpc.push({ name, args }); return { data: null, ...(h.rpcAnswer.shift() ?? { error: null }) }; }),
    storage: { from: () => ({ remove: vi.fn(async (paths: string[]) => { h.removed.push(paths); return { data: paths, error: null }; }) }) },
  })),
}));

import { registerDocument, setDocumentShared } from "@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions";

const PAT = "00000000-0000-4000-8000-0000000000a1";
const FOLDER = "00000000-0000-4000-8000-0000000000f1";
const DOC = "00000000-0000-4000-8000-0000000000d1";
beforeEach(() => { h.fn.length = 0; h.fnAnswer.length = 0; h.rpc.length = 0; h.rpcAnswer.length = 0; h.removed.length = 0; });

describe("196: registering a doctor's upload", () => {
  it("goes through the function's register action, never the old RPC, and removes nothing itself", async () => {
    h.fnAnswer.push({ ok: true, data: { document_id: DOC } });
    const r = await registerDocument(PAT, { path: `doc/${PAT}/${DOC}.pdf`, folderId: FOLDER, title: " Laudo ", shared: true });
    expect(r).toEqual({ ok: true, data: DOC });
    expect(h.fn).toEqual([{ action: "register", patient_id: PAT, path: `doc/${PAT}/${DOC}.pdf`, folder_id: FOLDER, title: "Laudo", shared: true, source: "doctor_upload", source_id: null, replaces_id: null }]);
    expect(h.rpc).toEqual([]);
    expect(h.removed).toEqual([]);
  });

  it("a refused file: its message, and the function (not the website) removes it", async () => {
    h.fnAnswer.push({ ok: false, code: "not_allowed_file" });
    expect(await registerDocument(PAT, { path: `doc/${PAT}/${DOC}.pdf`, folderId: FOLDER, title: "x", shared: false })).toEqual({ ok: false, code: "type" });
    h.fnAnswer.push({ ok: false, code: "storage_full" });
    expect(await registerDocument(PAT, { path: `doc/${PAT}/${DOC}.pdf`, folderId: FOLDER, title: "x", shared: false })).toEqual({ ok: false, code: "ownStorageFull" });
    expect(h.removed).toEqual([]);
  });
});

describe("196: sharing a never-checked file", () => {
  it("format_not_checked → check → shared", async () => {
    h.rpcAnswer.push({ error: { message: "format_not_checked" } }, { error: null });
    h.fnAnswer.push({ ok: true, data: { ok: true } });
    expect(await setDocumentShared(DOC, true)).toEqual({ ok: true, data: null });
    expect(h.fn).toEqual([{ action: "check", document_id: DOC }]);
    expect(h.rpc.map((x) => x.name)).toEqual(["set_document_shared", "set_document_shared"]);
  });

  it("the check refuses it: it stays internal, with cf's message", async () => {
    h.rpcAnswer.push({ error: { message: "format_not_checked" } });
    h.fnAnswer.push({ ok: false, code: "not_allowed_file" });
    expect(await setDocumentShared(DOC, true)).toEqual({ ok: false, code: "cantShareType" });
    expect(h.rpc).toHaveLength(1);
  });

  it("an already-checked file shares at once (no check)", async () => {
    expect(await setDocumentShared(DOC, true)).toEqual({ ok: true, data: null });
    expect(h.fn).toEqual([]);
  });
});
