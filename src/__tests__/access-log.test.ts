import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));

import { accessKindLabelKey, fileNameFromRef, isMissingFunction, logPatientOpen, readAccessLog } from "@/lib/accessLog";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";

const db = (result: { data?: unknown; error?: { code?: string; message?: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { rpc };
};

beforeEach(() => captureMessage.mockClear());

describe("logPatientOpen (migration 111)", () => {
  it("logs a 'patient' open for that patient", async () => {
    const d = db({});
    await logPatientOpen(d, "p1");
    expect(d.rpc).toHaveBeenCalledWith("log_record_access", { p_patient_id: "p1", p_kind: "patient" });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("is silent before 111 (the function doesn't exist)", async () => {
    await logPatientOpen(db({ error: { code: "PGRST202" } }), "p1");
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("never throws; a real failure goes to Sentry with the code only", async () => {
    await expect(logPatientOpen(db({ error: { code: "P0001", message: "not_allowed" } }), "p1")).resolves.toBeUndefined();
    expect(captureMessage).toHaveBeenCalledWith("access_log_failed", { level: "error", tags: { code: "P0001" } });
  });
});

describe("readAccessLog", () => {
  const row = (i: number) => ({
    accessed_at: new Date(Date.UTC(2026, 8, 28, 15, 0 - i)).toISOString(),
    actor_name: "Dra. Ana", actor_role: "professional", kind: "patient", object_ref: null,
  });

  it("asks for one extra row to know if there's more, and formats in the practice's zone", async () => {
    const d = db({ data: Array.from({ length: 51 }, (_, i) => row(i)) });
    const page = await readAccessLog(d, "p1", { locale: "en", timeZone: "America/Sao_Paulo" });
    expect(d.rpc).toHaveBeenCalledWith("get_patient_access_log", { p_patient_id: "p1", p_limit: 51, p_before: null });
    if (page === null || page === "failed") throw new Error("expected a page");
    expect(page.rows).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.rows[0].when).toContain("12:00"); // 15:00 UTC = 12:00 in São Paulo
    expect(page.rows[0]).toMatchObject({ actorName: "Dra. Ana", actorRole: "professional", kind: "patient", objectRef: null });
  });

  it("no tab before 111 or for a non-doctor; 'failed' for other errors", async () => {
    expect(await readAccessLog(db({ error: { code: "42883" } }), "p1", { locale: "en", timeZone: "UTC" })).toBeNull();
    expect(await readAccessLog(db({ error: { code: "P0001", message: "not_allowed" } }), "p1", { locale: "en", timeZone: "UTC" })).toBeNull();
    expect(await readAccessLog(db({ error: { code: "57014", message: "timeout" } }), "p1", { locale: "en", timeZone: "UTC" })).toBe("failed");
  });
});

describe("helpers", () => {
  it("isMissingFunction", () => {
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ code: "42883" })).toBe(true);
    expect(isMissingFunction({ code: "P0001" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });

  it("fileNameFromRef takes the name after <practice>/<patient>/", () => {
    expect(fileNameFromRef("prof/pat/exame 1.pdf")).toBe("exame 1.pdf");
    expect(fileNameFromRef("prof/pat/sub/x.png")).toBe("sub/x.png");
    expect(fileNameFromRef("prof/pat")).toBeNull();
    expect(fileNameFromRef(null)).toBeNull();
  });

  it("the CSV export (126) and imported data (131) have their own labels, never \"the patient\"", () => {
    expect(accessKindLabelKey("export")).toBe("accessKindExport");
    expect(accessKindLabelKey("imported")).toBe("accessKindImported");
    expect(accessKindLabelKey("patient")).toBe("accessKindPatient");
    expect(pt.patientDetail.accessKindExport).toBe("Exportado na lista de pacientes (CSV)");
    expect(pt.patientDetail.accessKindImported).toBe("Abriu os dados importados");
    expect(en.patientDetail.accessKindImported).toBe("Opened the imported data");
  });
});
