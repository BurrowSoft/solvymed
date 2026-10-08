import { beforeEach, describe, expect, it, vi } from "vitest";
import { SNAPSHOT_FOLDER, sharesSnapshot, snapshotTitle, snapshotUnsignedLine } from "@/lib/medicalDocuments";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 1.8.0 B2 (the A spec; ad, both platforms): a prescription or clinical
// document is shared with the patient as a PDF copy in its folder, titled as
// printed with its date, with the unsigned-copy line; a correction or edit
// replaces the earlier copy; the controlled prescription is never shared.

const h = vi.hoisted(() => ({
  folders: [] as { id: string; default_key: string | null }[],
  docs: [] as Record<string, unknown>[],
  fnCalls: [] as Record<string, unknown>[],
  log: [] as string[],
  fnResult: { ok: true, data: { document_id: "new-doc" } } as { ok: boolean; data?: unknown; code?: string },
  flag: true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
    rpc: async (fn: string) => { h.log.push(`rpc:${fn}`); return fn === "get_document_folders" ? { data: h.folders, error: null } : fn === "list_patient_documents" ? { data: h.docs, error: null } : { data: null, error: null }; },
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: async () => { h.log.push("upload"); return { error: null }; } }) } }),
}));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: async () => h.flag }));
vi.mock("@/lib/patientDocumentFn", () => ({ patientDocumentFn: async (_s: unknown, body: Record<string, unknown>) => { h.log.push(`fn:${body.action}`); h.fnCalls.push(body); return h.fnResult; } }));

import { prepareSnapshot, registerSnapshot } from "@/app/[locale]/(site)/dashboard/(gated)/patients/snapshot-actions";
import { shareSnapshot } from "@/lib/shareSnapshot";

const PAT = "22222222-2222-4222-8222-222222222222";
const RX1 = "33333333-3333-4333-8333-333333333333";
const RX2 = "44444444-4444-4444-8444-444444444444";
const input = (o: Partial<Parameters<typeof registerSnapshot>[1]> = {}) => ({
  path: `11111111-1111-4111-8111-111111111111/${PAT}/x.pdf`, source: "prescription" as const, sourceId: RX2,
  replacesId: null, folderId: "55555555-5555-4555-8555-555555555555", title: "Receita 08/10/2026", ...o,
});

beforeEach(() => {
  h.folders = [{ id: "a0000000-0000-4000-8000-00000000000a", default_key: "start" }, { id: "b0000000-0000-4000-8000-00000000000b", default_key: "prescriptions" }, { id: "c0000000-0000-4000-8000-00000000000c", default_key: "certificates" }];
  h.docs = []; h.fnCalls = []; h.log = []; h.flag = true;
  h.fnResult = { ok: true, data: { document_id: "new-doc" } };
});

describe("the shared rules (lib/medicalDocuments, the app pastes them)", () => {
  it("folders by type; the controlled prescription is never shared", () => {
    expect(SNAPSHOT_FOLDER).toEqual({ certificate: "certificates", declaration: "certificates", th_certificate: "certificates", exam_request: "exams" });
    expect(sharesSnapshot("controlled_prescription")).toBe(false);
    expect(sharesSnapshot("exam_request")).toBe(true);
  });

  it("the title as printed in the document's language, with its date in its calendar (ad)", () => {
    expect(snapshotTitle("certificate", "pt-BR", "2026-10-08")).toBe("Atestado médico 08/10/2026");
    expect(snapshotTitle("th_certificate", "th", "2026-10-08")).toBe("ใบรับรองแพทย์ 08/10/2569");
    expect(snapshotTitle("exam_request", "en", "2026-10-08")).toBe("Exam request 08/10/2026");
    expect(snapshotTitle("certificate", "de", "2026-10-08")).toBe("Ärztliches Attest 08/10/2026");
  });

  it("the unsigned-copy line in the document's language", () => {
    expect(snapshotUnsignedLine("pt-BR")).toBe("Cópia sem assinatura, para consulta do paciente.");
    expect(snapshotUnsignedLine("th")).toBe("สำเนาไม่มีลายมือชื่อ สำหรับผู้ป่วยใช้อ้างอิง");
  });

  it("the messages (ad's wording) in en / pt-BR / th", () => {
    expect([en.docs.snapshotFailed, pt.docs.snapshotFailed, th.docs.snapshotFailed]).toEqual([
      "Saved, but the copy couldn't be shared with the patient.",
      "Salvo, mas não foi possível compartilhar a cópia com o paciente.",
      "บันทึกแล้ว แต่ไม่สามารถแชร์สำเนาให้ผู้ป่วยได้",
    ]);
    expect([en.docs.tryAgain, pt.docs.tryAgain, th.docs.tryAgain]).toEqual(["Try again", "Tentar de novo", "ลองอีกครั้ง"]);
  });
});

describe("prepareSnapshot: looked up before the upload", () => {
  it("the type's folder, else \"Comece aqui\"", async () => {
    expect(await prepareSnapshot(PAT, { source: "prescription", replacesSourceId: null, folderKey: "prescriptions" })).toEqual({ ok: true, data: { folderId: "b0000000-0000-4000-8000-00000000000b", replacesId: null } });
    expect(await prepareSnapshot(PAT, { source: "medical_document", replacesSourceId: null, folderKey: "exams" })).toEqual({ ok: true, data: { folderId: "a0000000-0000-4000-8000-00000000000a", replacesId: null } });
  });

  it("an edit or correction replaces the live copy of its document, matched by its source (86)", async () => {
    h.docs = [
      { id: "old-other", source: "medical_document", medical_document_id: RX1, replaced: false },
      { id: "old-gone", source: "prescription", prescription_id: RX1, replaced: true },
      { id: "d0000000-0000-4000-8000-00000000000d", source: "prescription", prescription_id: RX1, replaced: false },
    ];
    expect(await prepareSnapshot(PAT, { source: "prescription", replacesSourceId: RX1, folderKey: "prescriptions" })).toEqual({ ok: true, data: { folderId: "b0000000-0000-4000-8000-00000000000b", replacesId: "d0000000-0000-4000-8000-00000000000d" } });
  });

  it("off when the flag is off", async () => {
    h.flag = false;
    expect(await prepareSnapshot(PAT, { source: "prescription", replacesSourceId: null, folderKey: "prescriptions" })).toEqual({ ok: false, code: "noAccess" });
  });
});

describe("registerSnapshot", () => {
  it("registers it shared, with the prepared folder and replaced copy, and lists nothing (it would adopt the upload)", async () => {
    expect(await registerSnapshot(PAT, input({ replacesId: "66666666-6666-4666-8666-666666666666" }))).toEqual({ ok: true, data: "new-doc" });
    expect(h.fnCalls[0]).toMatchObject({ action: "register", patient_id: PAT, folder_id: "55555555-5555-4555-8555-555555555555", shared: true, source: "prescription", source_id: RX2, replaces_id: "66666666-6666-4666-8666-666666666666", title: "Receita 08/10/2026" });
    expect(h.log.filter((x) => x.startsWith("rpc:"))).toEqual([]);
  });

  it("storage full comes back as storageFull; off when the flag is off", async () => {
    h.fnResult = { ok: false, code: "storage_full" };
    const r = await registerSnapshot(PAT, input());
    expect(r.ok).toBe(false);
    expect(["storageFull", "ownStorageFull"]).toContain((r as { code: string }).code);
    h.flag = false;
    expect(await registerSnapshot(PAT, input())).toEqual({ ok: false, code: "noAccess" });
  });
});

describe("shareSnapshot: an edit's new copy replaces the old one (13 on #470)", () => {
  it("lists the patient's documents BEFORE uploading, never between the upload and the register", async () => {
    h.docs = [{ id: "d0000000-0000-4000-8000-00000000000d", source: "prescription", prescription_id: RX1, replaced: false }];
    const out = await shareSnapshot({ doctorId: "11111111-1111-4111-8111-111111111111", patientId: PAT, bytes: new Uint8Array([37, 80, 68, 70]), source: "prescription", sourceId: RX1, replacesSourceId: RX1, folderKey: "prescriptions", title: "Receita 08/10/2026" });
    expect(out).toBe("shared");
    expect(h.log).toEqual(["rpc:get_document_folders", "rpc:list_patient_documents", "upload", "fn:register"]);
    expect(h.fnCalls[0]).toMatchObject({ source_id: RX1, replaces_id: "d0000000-0000-4000-8000-00000000000d", folder_id: "b0000000-0000-4000-8000-00000000000b" });
  });

  it("a failed lookup uploads nothing (no orphan to adopt)", async () => {
    h.flag = false;
    expect(await shareSnapshot({ doctorId: "11111111-1111-4111-8111-111111111111", patientId: PAT, bytes: new Uint8Array([1]), source: "prescription", sourceId: RX1, replacesSourceId: null, folderKey: "prescriptions", title: "x" })).toBe("failed");
    expect(h.log).not.toContain("upload");
  });
});


