import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import fs from "node:fs";
import path from "node:path";
import pt from "@/messages/pt-BR.json";
import { cleanTemplate, currentRecordSections, recordInput, recordSectionsFromForm } from "@/lib/recordTemplates";

// 1.8.0 D record templates (migration 189, flag 'record_templates'): the
// limits match the database's; a record written with a template sends its
// sections + the composed text; a sectioned record is edited with its own
// sections; Settings copies a preset in the UI language.

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown[] }[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => {
  const rec = (fn: string) => vi.fn(async (...args: unknown[]) => { h.calls.push({ fn, args }); return {}; });
  return Object.fromEntries([
    "createRecord", "deleteRecord", "updateRecord", "addRecordCorrection", "createPrescription", "deletePrescription", "updatePrescription",
    "addPrescriptionCorrection", "updatePatient", "deletePatient", "toggleBookingBlock", "generatePatientInviteCode", "getArchivePreview",
    "archivePatient", "restorePatient", "loadAccessLog", "mergeAvailable",
  ].map((n) => [n, rec(n)]));
});
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/record-template-actions", () => ({
  saveRecordTemplate: vi.fn(async (id: string | null, input: { name: string; sections: { title: string; hint?: string }[] }) => {
    h.calls.push({ fn: "saveRecordTemplate", args: [id, input] });
    return { ok: true, row: { id: "00000000-0000-4000-8000-0000000000aa", name: input.name, sections: input.sections, position: 0 } };
  }),
  deleteRecordTemplate: vi.fn(async () => ({ ok: true })),
}));

import { PatientTabs, type MedRecord } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import { RecordTemplatesCard } from "@/app/[locale]/(site)/dashboard/settings/RecordTemplatesCard";

const T = pt.recordTemplates;
const patient = { id: "p1", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };
const tpl = { id: "t1", name: "Retorno", position: 0, sections: [{ title: "Queixa", hint: "O que trouxe" }, { title: "Conduta" }] };

function page(records: MedRecord[], recordTemplates: typeof tpl[] | null) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={patient} records={records} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone="America/Sao_Paulo" recordTemplates={recordTemplates} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.tabRecords.replace("{n}", String(records.length)) }));
}
const sent = (fn: string) => h.calls.filter((c) => c.fn === fn).map((c) => c.args[c.args.length - 1] as FormData);

beforeEach(() => { h.calls.length = 0; });

describe("record template limits (189)", () => {
  it("drops empty rows, trims, and refuses what the database would", () => {
    expect(cleanTemplate({ name: "  A ", sections: [{ title: " X ", hint: " " }, { title: "", hint: "" }] })).toEqual({ ok: true, name: "A", sections: [{ title: "X" }] });
    expect(cleanTemplate({ name: " ", sections: [{ title: "X" }] })).toEqual({ ok: false, error: "name" });
    expect(cleanTemplate({ name: "A", sections: [] })).toEqual({ ok: false, error: "sections" });
    expect(cleanTemplate({ name: "A", sections: [{ title: "", hint: "only a hint" }] })).toEqual({ ok: false, error: "title" });
    expect(cleanTemplate({ name: "A", sections: [{ title: "X", hint: "h".repeat(501) }] })).toEqual({ ok: false, error: "hint" });
    expect(cleanTemplate({ name: "A", sections: Array.from({ length: 31 }, () => ({ title: "X" })) })).toEqual({ ok: false, error: "sections" });
  });

  it("sections only while they still are the record (an older client edits content alone, d1)", () => {
    const s = [{ title: "Q", text: "a" }, { title: "C", text: "" }];
    expect(currentRecordSections(s, "Q:\na")).toEqual(s);
    expect(currentRecordSections(s, "Q:\na, edited elsewhere")).toBeNull();
    expect(currentRecordSections(null, "x")).toBeNull();
    // A record saved before the fix: the browser's form sent content with \r\n (53).
    expect(currentRecordSections(s, "Q:\r\na")).toEqual(s);
  });

  it("the server composes content from the sections; free text keeps LF line ends (53)", () => {
    const sections = JSON.stringify([{ title: "Queixa principal", text: "cefaleia\r\nhá 2 dias" }, { title: "Conduta", text: "" }]);
    expect(recordInput("Queixa principal:\r\nignored", sections)).toEqual({
      ok: true, content: "Queixa principal:\ncefaleia\nhá 2 dias",
      sections: [{ title: "Queixa principal", text: "cefaleia\nhá 2 dias" }, { title: "Conduta", text: "" }],
    });
    expect(recordInput(" a\r\nb ", null)).toEqual({ ok: true, content: "a\nb", sections: null });
    expect(recordInput("x", "not json")).toEqual({ ok: false });
  });

  it("a record's sections from the form: null when absent, refused when malformed or too big", () => {
    expect(recordSectionsFromForm(null)).toEqual({ ok: true, sections: null });
    expect(recordSectionsFromForm(JSON.stringify([{ title: " Q ", text: " a " }]))).toEqual({ ok: true, sections: [{ title: "Q", text: "a" }] });
    expect(recordSectionsFromForm("not json").ok).toBe(false);
    expect(recordSectionsFromForm(JSON.stringify([{ title: "Q" }])).ok).toBe(false);
    expect(recordSectionsFromForm(JSON.stringify([])).ok).toBe(false);
    expect(recordSectionsFromForm(JSON.stringify([{ title: "Q", text: "x".repeat(100000) }])).ok).toBe(false);
  });
});

describe("writing a record with a template", () => {
  it("no picker while the flag is off", () => {
    page([], null);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    expect(screen.queryByRole("combobox", { name: T.template })).toBeNull();
  });

  it("no picker for a doctor without templates; with one, \"Sem modelo\" comes first (cf)", () => {
    page([], []);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    expect(screen.queryByRole("combobox", { name: T.template })).toBeNull();
    cleanup();
    page([], [tpl]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    const options = within(screen.getByRole("combobox", { name: T.template })).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Sem modelo", "Retorno"]);
  });

  it("the template's sections, hints as placeholders; sends sections, the template name and the composed text", async () => {
    page([], [tpl]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    fireEvent.change(screen.getByRole("combobox", { name: T.template }), { target: { value: "t1" } });
    const q = screen.getByRole("textbox", { name: "Queixa" });
    expect(q).toHaveAttribute("placeholder", "O que trouxe");
    fireEvent.change(q, { target: { value: "Insônia" } });
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.saveRecord }));
    await waitFor(() => expect(sent("createRecord")).toHaveLength(1));
    const fd = sent("createRecord")[0];
    expect(fd.get("content")).toBe("Queixa:\nInsônia");
    expect(JSON.parse(String(fd.get("sections")))).toEqual([{ title: "Queixa", text: "Insônia" }, { title: "Conduta", text: "" }]);
    expect(fd.get("template_name")).toBe("Retorno");
  });

  it("back to free text: the plain box, no sections sent", async () => {
    page([], [tpl]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.patientDetail.newRecord) }));
    const pick = screen.getByRole("combobox", { name: T.template });
    fireEvent.change(pick, { target: { value: "t1" } });
    fireEvent.change(pick, { target: { value: "" } });
    expect(screen.queryByRole("textbox", { name: "Queixa" })).toBeNull();
  });

  it("a sectioned record shows its filled sections and template; Edit keeps its sections", async () => {
    const rec: MedRecord = {
      id: "r1", date: "2026-10-07", time: "10:00", content: "Queixa:\nDor", record_type: "free_text",
      created_at: new Date().toISOString(), created_by: "d1",
      template_name: "Retorno", sections: [{ title: "Queixa", text: "Dor" }, { title: "Conduta", text: "" }],
    };
    page([rec], [tpl]);
    const box = screen.getByTestId("record-sections");
    expect(within(box).getByText("Queixa")).toBeInTheDocument();
    expect(within(box).queryByText("Conduta")).toBeNull();
    expect(screen.getByText("Retorno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.editEntry }));
    expect(screen.queryByRole("combobox", { name: T.template })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Conduta" }), { target: { value: "Retorno em 30 dias" } });
    fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.saveRecord }));
    await waitFor(() => expect(sent("updateRecord")).toHaveLength(1));
    expect(JSON.parse(String(sent("updateRecord")[0].get("sections")))).toEqual([{ title: "Queixa", text: "Dor" }, { title: "Conduta", text: "Retorno em 30 dias" }]);
  });
});

describe("Settings → Modelos de prontuário", () => {
  it("a specialty preset opens as an editable copy in the UI language and saves", async () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <RecordTemplatesCard initial={[]} loadFailed={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(T.empty)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.createScratch })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: T.fromPreset }));
    fireEvent.click(screen.getByRole("button", { name: "Psicologia" }));
    expect(screen.getByDisplayValue("Psicologia")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: T.sectionTitle })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await waitFor(() => expect(screen.getByText(T.saved)).toBeInTheDocument());
    const [id, input] = h.calls.find((c) => c.fn === "saveRecordTemplate")!.args as [null, { name: string; sections: { title: string }[] }];
    expect(id).toBeNull();
    expect(input.name).toBe("Psicologia");
    expect(input.sections.map((s) => s.title)).toEqual(["Demanda", "História de vida", "Relato da sessão", "Observações clínicas", "Plano terapêutico"]);
    expect(screen.getByRole("listitem")).toHaveTextContent("Psicologia");
  });
});

describe("strings", () => {
  it("recordTemplates has the same keys in every web locale", () => {
    const dir = path.join(process.cwd(), "src/messages");
    const en = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8").replace(/^﻿/, "")).recordTemplates).sort();
    for (const f of fs.readdirSync(dir)) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, ""));
      expect(Object.keys(m.recordTemplates ?? {}).sort(), f).toEqual(en);
    }
  });
});
