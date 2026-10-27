import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { addedByLine, readCreatedByKind, toCreatedByKind, type CreatedByKind } from "@/lib/patientCreatedBy";

// Launch polish 42 (01, from #563's row): "Adicionado por" said "(secretaria)" for any
// creator but the doctor, so a self-joined patient read as a secretary. The server's
// patient_created_by_kind decides; before it's live (or on 42501) the line has no role.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";

const BASE = { id: "p1", full_name: "Ana", created_at: "2026-10-01T12:00:00Z", professional_id: "d1", created_by: "u2", created_by_name: "ana@example.invalid" };
const page = (kind: CreatedByKind | null, over: Partial<typeof BASE> | { created_by: null } = {}) => render(
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <PatientTabs patient={{ ...BASE, ...over, created_by_kind: kind }} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="d1" timeZone="America/Sao_Paulo" />
  </NextIntlClientProvider>,
);
const D = pt.patientDetail;

describe("42: who added the patient", () => {
  it("the patient themselves: \"Cadastrado pelo próprio paciente\", never their e-mail as a secretary", () => {
    page("self");
    expect(screen.getByText(D.addedBySelf)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/secretaria|ana@example\.invalid/);
  });

  it("a secretary: today's line", () => {
    page("secretary");
    expect(screen.getByText(/ana@example\.invalid \(secretaria\), /)).toBeInTheDocument();
  });

  it("anyone else, or the RPC not live yet (null): the name with no role", () => {
    for (const kind of ["other", null] as const) {
      const { unmount } = page(kind);
      expect(screen.getByText(/^ana@example\.invalid, /)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/secretaria/);
      unmount();
    }
  });

  it("the doctor, or an unknown creator (account deleted): no line", () => {
    for (const [kind, over] of [["doctor", {}], ["unknown", { created_by: null }], [null, { created_by: "d1" }]] as const) {
      const { unmount } = page(kind, over);
      expect(screen.queryByText(D.addedBy)).toBeNull();
      unmount();
    }
  });

  it("the rule, without the page", () => {
    const p = { created_by: "u2", professional_id: "d1", created_by_name: "X" };
    expect(addedByLine("self", { ...p, created_by_name: null })).toBe("self");
    expect(addedByLine("secretary", p)).toBe("secretary");
    expect(addedByLine("other", p)).toBe("other");
    expect(addedByLine(null, p)).toBe("other");
    expect(addedByLine("doctor", p)).toBeNull();
    expect(addedByLine("unknown", p)).toBeNull();
    expect(toCreatedByKind("bogus")).toBeNull();
  });

  it("the read: an error (42501, or the RPC missing) or a throw is null", async () => {
    const rpc = (r: unknown) => ({ rpc: vi.fn(async () => r) }) as never;
    expect(await readCreatedByKind(rpc({ data: "self", error: null }), "p1")).toBe("self");
    expect(await readCreatedByKind(rpc({ data: null, error: { code: "42501", message: "forbidden" } }), "p1")).toBeNull();
    expect(await readCreatedByKind(rpc({ data: null, error: { code: "PGRST202" } }), "p1")).toBeNull();
    expect(await readCreatedByKind({ rpc: vi.fn(async () => { throw new Error("net"); }) } as never, "p1")).toBeNull();
  });

  it("the page asks the server for doctor and secretary alike", () => {
    const src = readFileSync("src/app/[locale]/(site)/dashboard/(gated)/patients/[id]/page.tsx", "utf8");
    expect(src).toContain("readCreatedByKind(supabase, id)");
    expect(src).toContain("created_by_kind: createdByKind");
  });

  it("01's strings", () => {
    expect([pt.patientDetail.addedBySelf, en.patientDetail.addedBySelf, th.patientDetail.addedBySelf])
      .toEqual(["Cadastrado pelo próprio paciente", "Added by the patient", "ผู้ป่วยลงทะเบียนเอง"]);
  });
});
