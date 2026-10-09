import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.8.0 B2 (b2, after 13 on #470): the patient's copy is made in this page,
// so leaving mid-share lost it silently. Until the outcome a modal nothing
// can dismiss blocks the page, and closing the tab asks first.

const h = vi.hoisted(() => ({ resolve: null as null | ((o: string) => void) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => {
  const names = ["createRecord", "deleteRecord", "updateRecord", "addRecordCorrection", "deletePrescription", "updatePrescription", "addPrescriptionCorrection", "updatePatient", "deletePatient", "toggleBookingBlock", "generatePatientInviteCode", "getArchivePreview", "archivePatient", "restorePatient", "loadAccessLog"];
  return { ...Object.fromEntries(names.map((n) => [n, vi.fn(async () => ({}))])), createPrescription: vi.fn(async () => ({ id: "33333333-3333-4333-8333-333333333333" })) };
});
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({})) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => new Proxy({}, { get: () => vi.fn(async () => ({ ok: true, data: { folders: [], documents: [] } })) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots", () => ({
  shareRxSnapshot: vi.fn(() => new Promise<string>((res) => { h.resolve = res; })),
  shareDocumentSnapshot: vi.fn(async () => "shared"),
}));

import { PatientTabs } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/PatientDetailClient";

const patient = { id: "22222222-2222-4222-8222-222222222222", full_name: "Ana", created_at: "2026-10-01T12:00:00Z" };

async function saveRx() {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientTabs patient={patient} records={[]} prescriptions={[]} appointments={[]} locale="pt-BR" currentUserId="11111111-1111-4111-8111-111111111111" timeZone="America/Sao_Paulo" documentsOn />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Receitas/ }));
  fireEvent.click(await screen.findByRole("button", { name: pt.patientDetail.newPrescription }));
  fireEvent.change(screen.getByPlaceholderText(pt.patientDetail.medicationName), { target: { value: "Amoxicilina" } });
  fireEvent.click(screen.getByRole("button", { name: pt.patientDetail.savePrescription }));
  await waitFor(() => expect(h.resolve).not.toBeNull());
}

describe("sharing the patient's copy holds the page until it's done", () => {
  it("a modal with the progress line and the leave-page prompt while pending; both go once shared", async () => {
    await saveRx();
    expect(screen.getByTestId("sharing-progress")).toHaveTextContent("Compartilhando com o paciente…");
    // 4f: nothing behind the modal can take focus; the modal has it.
    const overlay = screen.getByTestId("sharing-progress");
    const page = [...document.body.children].filter((el) => el !== overlay);
    expect(page.length).toBeGreaterThan(0);
    expect(page.every((el) => el.hasAttribute("inert"))).toBe(true);
    expect(document.activeElement).toBe(overlay);
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);

    await act(async () => { h.resolve!("shared"); });
    expect(screen.queryByTestId("sharing-progress")).toBeNull();
    expect([...document.body.children].some((el) => el.hasAttribute("inert"))).toBe(false);
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("a failure ends the hold and shows the existing banner with Tentar de novo", async () => {
    h.resolve = null;
    await saveRx();
    await act(async () => { h.resolve!("failed"); });
    expect(screen.queryByTestId("sharing-progress")).toBeNull();
    expect(screen.getByTestId("share-issue")).toHaveTextContent(pt.docs.snapshotFailed);
    expect(screen.getByRole("button", { name: pt.docs.tryAgain })).toBeInTheDocument();
  });
});
