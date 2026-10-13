import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The F1 evidence (ec): one warning when a share is saved only by the
// form-id fallback, or the box shown ticked reads as off. Only the reason,
// the mode and yes/no flags; once per dialog; nothing else survives the
// scrub but the internal user id.

const h = vi.hoisted(() => ({ captured: [] as { msg: string; ctx: { level: string; tags: Record<string, string> } }[], createData: null as string | null }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: (msg: string, ctx: { level: string; tags: Record<string, string> }) => { h.captured.push({ msg, ctx }); } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  createMedicalDocument: vi.fn(async () => ({ ok: true, data: h.createData })),
  updateMedicalDocument: vi.fn(), correctMedicalDocument: vi.fn(), deleteMedicalDocument: vi.fn(), documentPrintData: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({
  loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })),
  copySharedNow: vi.fn(async () => "off"),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots", () => ({ shareRxSnapshot: vi.fn(async () => "shared"), shareDocumentSnapshot: vi.fn(async () => "shared") }));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";
import { scrubEvent } from "@/lib/sentryScrub";

const saveNewCertificate = async () => {
  render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PatientTabs patient={{ id: "44444444-4444-4444-8444-444444444444", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" }} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="33333333-3333-4333-8333-333333333333" timeZone="America/Sao_Paulo" documentsOn medicalDocs={{ list: [], country: "BR", hasPatientId: true }} /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^Receitas/ }));
  fireEvent.click(await screen.findByRole("button", { name: pt.documents.addDocument }));
  const d = screen.getByTestId("document-dialog");
  fireEvent.click(within(d).getByRole("button", { name: pt.documents.type.certificate }));
  fireEvent.click(within(d).getByRole("button", { name: pt.documents.save }));
};

beforeEach(() => { h.captured = []; h.createData = null; });

describe("document_share_check", () => {
  it("a share saved only by the form-id fallback: one warning, the reason/mode/flags only", async () => {
    await saveNewCertificate();
    await waitFor(() => expect(h.captured).toHaveLength(1));
    expect(h.captured[0]).toEqual({ msg: "document_share_check", ctx: { level: "warning", tags: { reason: "id_fallback", mode: "new", wantShare: "yes", hasId: "no" } } });
  });

  it("a normal save (the answer carries the id): nothing is sent", async () => {
    h.createData = "66666666-6666-4666-8666-666666666666";
    await saveNewCertificate();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.captured).toEqual([]);
  });

  it("through the scrub: the tags stay; the user is the internal id only (no e-mail, no IP)", () => {
    const event = {
      message: "document_share_check",
      tags: { reason: "id_fallback", mode: "new", wantShare: "yes", hasId: "no" },
      user: { id: "33333333-3333-4333-8333-333333333333", email: "dr@example.com", ip_address: "203.0.113.9" },
    };
    const out = scrubEvent(event as never) as unknown as { tags: Record<string, string>; user: Record<string, unknown> };
    expect(out.tags).toEqual({ reason: "id_fallback", mode: "new", wantShare: "yes", hasId: "no" });
    expect(out.user).toEqual({ id: "33333333-3333-4333-8333-333333333333" });
  });
});
