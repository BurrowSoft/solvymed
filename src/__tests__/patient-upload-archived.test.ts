import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { docErrorKey } from "@/lib/patientDocuments";

// Launch polish 39 (01, 10-27; contract specs/patient-upload-archived-contract.md in the
// mobile repo): after 260, uploading into an ARCHIVED record fails with not_accepting_files
// (403 from patient-document). The patient reads a neutral line that never says "archived";
// reading, listing, opening and their own removal are unchanged.

describe("not_accepting_files (260)", () => {
  it("maps to notAccepting, for the patient and the doctor", () => {
    expect(docErrorKey("not_accepting_files")).toBe("notAccepting");
    expect(docErrorKey("not_accepting_files", true)).toBe("notAccepting");
    // Not confused with the other not_* codes.
    expect(docErrorKey("not_allowed")).toBe("noAccess");
    expect(docErrorKey("not_found")).toBe("noAccess");
    expect(docErrorKey("not_allowed_file")).toBe("type");
  });

  it("the approved strings, never 'archived'", () => {
    expect([pt, en, th].map((m) => m.docs.err.notAccepting)).toEqual([
      "Este consultório não está recebendo arquivos no momento.",
      "This practice isn't accepting files right now.",
      "คลินิกนี้ยังไม่รับไฟล์ในขณะนี้",
    ]);
    // ("arquivos" = files: only the archived words count.)
    for (const m of [pt, en, th]) expect(m.docs.err.notAccepting).not.toMatch(/arquivad|archiv|ถาวร/i);
  });

  it("the patient's and the doctor's document screens show it (not the generic error)", () => {
    const mine = readFileSync("src/app/[locale]/(site)/my-appointments/MyDocuments.tsx", "utf8");
    const tab = readFileSync("src/app/[locale]/(site)/dashboard/(gated)/patients/[id]/DocumentsTab.tsx", "utf8");
    expect(mine).toContain('k === "notAccepting" ? t(`err.${k}`)');
    expect(tab).toContain('case "notAccepting":');
  });

  it("Help P15 and the App Map wait for migration-260", () => {
    const conditions = JSON.parse(readFileSync("content/help/conditions.json", "utf8"));
    expect(conditions["migration-260"].met).toBe(false);
    const help = readFileSync("content/help/02-pacientes.md", "utf8");
    expect(help).toContain("{pending:migration-260} Pacientes arquivados continuam vendo os documentos já compartilhados, mas não podem enviar novos arquivos.");
    expect(help).toContain("{pending:migration-260} Archived patients still see the documents already shared, but can't send new files.");
    expect(help).toContain("{pending:migration-260} ผู้ป่วยที่ถูกเก็บถาวรยังคงเห็นเอกสารที่แชร์ไว้แล้ว แต่ไม่สามารถส่งไฟล์ใหม่ได้");
    expect(readFileSync("src/lib/solvyai/app-map.ts", "utf8")).toContain('pending: ["patient-documents-live", "migration-260"]');
  });
});
