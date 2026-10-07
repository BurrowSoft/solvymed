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
  fnResult: { ok: true, data: { document_id: "new-doc" } } as { ok: boolean; data?: unknown; code?: string },
  flag: true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
    rpc: async (fn: string) => fn === "get_document_folders" ? { data: h.folders, error: null } : fn === "list_patient_documents" ? { data: h.docs, error: null } : { data: null, error: null },
  }),
}));
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => true }));
vi.mock("@/lib/myDoctors", () => ({ serverFlag: async () => h.flag }));
vi.mock("@/lib/patientDocumentFn", () => ({ patientDocumentFn: async (_s: unknown, body: Record<string, unknown>) => { h.fnCalls.push(body); return h.fnResult; } }));

import { registerSnapshot } from "@/app/[locale]/(site)/dashboard/(gated)/patients/snapshot-actions";

const PAT = "22222222-2222-4222-8222-222222222222";
const RX1 = "33333333-3333-4333-8333-333333333333";
const RX2 = "44444444-4444-4444-8444-444444444444";
const input = (o: Partial<Parameters<typeof registerSnapshot>[1]> = {}) => ({
  path: `11111111-1111-4111-8111-111111111111/${PAT}/x.pdf`, source: "prescription" as const, sourceId: RX2,
  replacesSourceId: null, folderKey: "prescriptions" as const, title: "Receita 08/10/2026", ...o,
});

beforeEach(() => {
  h.folders = [{ id: "f-start", default_key: "start" }, { id: "f-rx", default_key: "prescriptions" }, { id: "f-cert", default_key: "certificates" }];
  h.docs = []; h.fnCalls = []; h.flag = true;
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

describe("registerSnapshot", () => {
  it("registers it shared, in the type's folder, from its source", async () => {
    expect(await registerSnapshot(PAT, input())).toEqual({ ok: true, data: "new-doc" });
    expect(h.fnCalls[0]).toMatchObject({ action: "register", patient_id: PAT, folder_id: "f-rx", shared: true, source: "prescription", source_id: RX2, replaces_id: null, title: "Receita 08/10/2026" });
  });

  it("a missing default folder falls back to \"Comece aqui\"", async () => {
    await registerSnapshot(PAT, input({ source: "medical_document", folderKey: "exams" }));
    expect(h.fnCalls[0]).toMatchObject({ folder_id: "f-start", source: "medical_document" });
  });

  it("a correction replaces the live copy of the document it corrects, matched by its source (86)", async () => {
    h.docs = [
      { id: "old-other", source: "medical_document", medical_document_id: RX1, replaced: false },
      { id: "old-gone", source: "prescription", prescription_id: RX1, replaced: true },
      { id: "old-live", source: "prescription", prescription_id: RX1, replaced: false },
    ];
    await registerSnapshot(PAT, input({ replacesSourceId: RX1 }));
    expect(h.fnCalls[0]).toMatchObject({ replaces_id: "old-live" });
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

describe("deleting within 24 h removes the copies (ad)", () => {
  it("finds the doctor's own copies of exactly that document, before the delete", async () => {
    const { snapshotPathsOf } = await import("@/lib/snapshotCopies");
    const uid = "11111111-1111-4111-8111-111111111111";
    const rows = [
      { source: "prescription", prescription_id: RX1, storage_path: `${uid}/${PAT}/a.pdf` },
      { source: "prescription", prescription_id: RX2, storage_path: `${uid}/${PAT}/b.pdf` },
      { source: "medical_document", medical_document_id: RX1, storage_path: `${uid}/${PAT}/c.pdf` },
      { source: "prescription", prescription_id: RX1, storage_path: `someone-else/${PAT}/d.pdf` },
    ];
    const supabase = { rpc: async () => ({ data: rows, error: null }) } as never;
    expect(await snapshotPathsOf(supabase, uid, PAT, "prescription", RX1)).toEqual([`${uid}/${PAT}/a.pdf`]);
    expect(await snapshotPathsOf(supabase, uid, PAT, "medical_document", RX1)).toEqual([`${uid}/${PAT}/c.pdf`]);
  });
});
