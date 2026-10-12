import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// "Not shared yet" (1.9.0 item 1.4, migration 220): the intent is recorded
// with the save (share_intended_at / p_share; mark_share_intent for edits,
// corrections and a later "Share"); a prescription or document meant to be
// shared whose copy never arrived shows the mark with "Share with the
// patient". All of it off until not-shared-marker-live.

const h = vi.hoisted(() => ({
  live: true,
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  inserts: [] as Record<string, unknown>[],
  unshared: [] as string[],
  shared: [] as string[],
}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "not-shared-marker-live" ? h.live : real.conditionMet(id as never)) };
});

// ── The patient page ──
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({ ok: true, data: "new" })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({
  loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })),
  copySharedNow: vi.fn(async () => "off"),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/share-intent-actions", () => ({
  listUnshared: vi.fn(async () => h.unshared),
  markShareIntent: vi.fn(async (source: string, id: string) => { h.shared.push(`mark ${source}:${id}`); return { ok: true }; }),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots", () => ({
  shareRxSnapshot: vi.fn(async (o: { rxId: string }) => { h.shared.push(`share rx ${o.rxId}`); h.unshared = []; return "shared"; }),
  shareDocumentSnapshot: vi.fn(async () => "shared"),
}));

import { PatientTabs, type Rx } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";

const ME = "33333333-3333-4333-8333-333333333333";
const patient = { id: "44444444-4444-4444-8444-444444444444", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };
const rx: Rx = { id: "55555555-5555-4555-8555-555555555555", date: "2026-10-05", created_at: "2026-10-05T12:00:00Z", created_by: ME, prescription_items: [{ name: "Dipirona", dosage: "1 cp", frequency: "6/6 h", duration: "3 dias" }] } as Rx;
const tab = (documentsOn = true) => {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={patient} records={[]} prescriptions={[rx]} appointments={[]} locale="pt-BR" currentUserId={ME} timeZone="America/Sao_Paulo"
        documentsOn={documentsOn} medicalDocs={{ list: [], country: "BR", hasPatientId: true }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Receitas/ }));
};

describe("the mark on the patient page", () => {
  beforeEach(() => { h.live = true; h.unshared = []; h.shared = []; });

  it("meant to be shared, no copy: \"Ainda não compartilhado\"; Share records the intent, shares, and the mark goes", async () => {
    h.unshared = [`prescription:${rx.id}`];
    tab();
    expect(await screen.findByTestId("not-shared")).toHaveTextContent(pt.docs.notSharedYet);
    fireEvent.click(screen.getByRole("button", { name: pt.docs.share }));
    await waitFor(() => expect(h.shared).toEqual([`mark prescription:${rx.id}`, `share rx ${rx.id}`]));
    await waitFor(() => expect(screen.queryByTestId("not-shared")).toBeNull());
  });

  it("nothing pending, documents off, or the condition off: no mark", async () => {
    tab();
    await waitFor(() => expect(screen.queryByTestId("not-shared")).toBeNull());
  });

  it("the condition off: no mark even if the server would list it", async () => {
    h.live = false;
    h.unshared = [`prescription:${rx.id}`];
    tab();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("not-shared")).toBeNull();
  });
});
