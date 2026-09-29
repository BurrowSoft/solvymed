import { beforeEach, describe, expect, it, vi } from "vitest";
import { folderFor, isFileDeletable, pathBelongs, safeFileName, withCounter } from "@/lib/patientFiles";

// Exams and files on the website (Help P7): the doctor's own folder only,
// delete within 24 h, hide after that, and every open logged.

const h = vi.hoisted(() => {
  const state = {
    professional: true,
    objects: [] as { id: string | null; name: string; created_at?: string; metadata?: Record<string, unknown> }[],
    listed: [] as string[],
    removed: [] as string[][],
    removeResult: [{}] as unknown[],
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    rpcError: null as null | { message: string },
    states: [] as Record<string, unknown>[],
  };
  const bucket = {
    list: async (folder: string) => { state.listed.push(folder); return { data: state.objects, error: null }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
    remove: async (paths: string[]) => { state.removed.push(paths); return { data: state.removeResult, error: null }; },
  };
  function query(table: string) {
    const rows = table === "patient_file_state" ? state.states : [];
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: table === "user_roles" ? { role: state.professional ? "professional" : "secretary" } : null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return q;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
    from: query,
    storage: { from: () => bucket },
    rpc: async (fn: string, args: Record<string, unknown>) => { state.rpcs.push({ fn, args }); return { data: null, error: fn === "hide_patient_file" ? state.rpcError : null }; },
  };
  return { state, client };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.client }));

import { deletePatientFile, hidePatientFile, listPatientFiles, openPatientFile } from "@/app/[locale]/(site)/dashboard/patients/files-actions";

beforeEach(() => {
  Object.assign(h.state, { professional: true, objects: [], listed: [], removed: [], removeResult: [{}], rpcs: [], rpcError: null, states: [] });
});

describe("patientFiles helpers", () => {
  it("puts exams in their own folder", () => {
    expect(folderFor("d", "11111111-1111-4111-8111-111111111111", "exams")).toBe("d/11111111-1111-4111-8111-111111111111/exams");
    expect(folderFor("d", "p", "files")).toBe("d/p");
  });

  it("accepts only this doctor's patient paths", () => {
    expect(pathBelongs("d/11111111-1111-4111-8111-111111111111/a.pdf", "d", "11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(pathBelongs("d/11111111-1111-4111-8111-111111111111/exams/a.pdf", "d", "11111111-1111-4111-8111-111111111111", "exams")).toBe(true);
    expect(pathBelongs("d/11111111-1111-4111-8111-111111111111/exams/a.pdf", "d", "11111111-1111-4111-8111-111111111111", "files")).toBe(false);
    expect(pathBelongs("x/11111111-1111-4111-8111-111111111111/a.pdf", "d", "11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(pathBelongs("d/22222222-2222-4222-8222-222222222222/a.pdf", "d", "11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(pathBelongs("d/11111111-1111-4111-8111-111111111111/../22222222-2222-4222-8222-222222222222/a.pdf", "d", "11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(pathBelongs("d/11111111-1111-4111-8111-111111111111/other/a.pdf", "d", "11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("allows deleting for 24 hours", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(isFileDeletable("2026-10-01T12:00:01Z", now)).toBe(true);
    expect(isFileDeletable("2026-10-01T12:00:00Z", now)).toBe(false);
    expect(isFileDeletable("not a date", now)).toBe(false);
  });

  it("makes safe names and counters", () => {
    expect(safeFileName("../raio x/tórax.PDF")).toBe(".._raio x_tórax.PDF");
    expect(safeFileName("  ")).toBe("file");
    expect(safeFileName("a".repeat(200) + ".pdf")).toHaveLength(120);
    expect(withCounter("exam.pdf", 2)).toBe("exam (2).pdf");
    expect(withCounter("exam", 3)).toBe("exam (3)");
  });
});

describe("files actions", () => {
  it("lists the doctor's folder, skipping sub-folders, with the hidden state", async () => {
    h.state.objects = [
      { id: null, name: "exams" },
      { id: "1", name: "a.pdf", created_at: "2026-10-01T10:00:00Z", metadata: { mimetype: "application/pdf", size: 2048 } },
      { id: "2", name: "b.jpg", created_at: "2026-09-01T10:00:00Z", metadata: { mimetype: "image/jpeg", size: 10 } },
    ];
    h.state.states = [{ object_path: "doc-1/11111111-1111-4111-8111-111111111111/b.jpg", hidden_at: "2026-09-05T10:00:00Z", hidden_by_name: "Dra. A", hidden_reason: "wrong patient" }];
    const r = await listPatientFiles("11111111-1111-4111-8111-111111111111", "files");
    expect(h.state.listed).toEqual(["doc-1/11111111-1111-4111-8111-111111111111"]);
    expect(r.ok && r.data.map((f) => [f.name, f.path, !!f.hidden])).toEqual([["a.pdf", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", false], ["b.jpg", "doc-1/11111111-1111-4111-8111-111111111111/b.jpg", true]]);
    expect(r.ok && r.data[1].hidden).toEqual({ at: "2026-09-05T10:00:00Z", byName: "Dra. A", reason: "wrong patient" });
  });

  it("refuses a patient id that isn't a UUID", async () => {
    expect(await listPatientFiles("../other", "files")).toEqual({ ok: false, code: "not_doctor" });
    expect(await openPatientFile("p-1", "doc-1/p-1/a.pdf")).toEqual({ ok: false, code: "not_doctor" });
    expect(h.state.listed).toEqual([]);
  });

  it("refuses a secretary", async () => {
    h.state.professional = false;
    expect(await listPatientFiles("11111111-1111-4111-8111-111111111111", "exams")).toEqual({ ok: false, code: "not_doctor" });
    expect(await openPatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf")).toEqual({ ok: false, code: "not_doctor" });
    expect(h.state.listed).toEqual([]);
  });

  it("opens with a signed link and logs the access", async () => {
    const r = await openPatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/exams/a.pdf");
    expect(r).toEqual({ ok: true, data: "https://signed/doc-1/11111111-1111-4111-8111-111111111111/exams/a.pdf" });
    expect(h.state.rpcs).toEqual([{ fn: "log_record_access", args: { p_patient_id: "11111111-1111-4111-8111-111111111111", p_kind: "file", p_object_ref: "doc-1/11111111-1111-4111-8111-111111111111/exams/a.pdf" } }]);
  });

  it("never opens another practice's or patient's path", async () => {
    expect((await openPatientFile("11111111-1111-4111-8111-111111111111", "doc-2/11111111-1111-4111-8111-111111111111/a.pdf")).ok).toBe(false);
    expect((await openPatientFile("11111111-1111-4111-8111-111111111111", "doc-1/22222222-2222-4222-8222-222222222222/a.pdf")).ok).toBe(false);
    expect(h.state.rpcs).toEqual([]);
  });

  it("deletes within 24 h, and says when the window has passed", async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    expect(await deletePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", fresh)).toEqual({ ok: true, data: null });
    expect(h.state.removed).toEqual([["doc-1/11111111-1111-4111-8111-111111111111/a.pdf"]]);
    expect(await deletePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", "2026-01-01T00:00:00Z")).toEqual({ ok: false, code: "delete_window_passed" });
    expect(h.state.removed).toHaveLength(1);
    // Storage refused it (the window closed on the server's clock).
    h.state.removeResult = [];
    expect(await deletePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", fresh)).toEqual({ ok: false, code: "delete_window_passed" });
  });

  it("hides with a reason", async () => {
    expect(await hidePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", "   ")).toEqual({ ok: false, code: "reason_required" });
    expect(h.state.rpcs).toEqual([]);
    expect(await hidePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", " duplicate ")).toEqual({ ok: true, data: null });
    expect(h.state.rpcs).toEqual([{ fn: "hide_patient_file", args: { p_path: "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", p_reason: "duplicate" } }]);
    h.state.rpcError = { message: "boom" };
    expect(await hidePatientFile("11111111-1111-4111-8111-111111111111", "doc-1/11111111-1111-4111-8111-111111111111/a.pdf", "x")).toEqual({ ok: false, code: "generic" });
  });
});
