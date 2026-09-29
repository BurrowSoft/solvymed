import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// "Open" on a file (web tester 2's #147 finding): the signed link opens in
// the new tab, and the SolvyMed tab never navigates away from the patient.

const h = vi.hoisted(() => ({ openResult: { ok: true, data: "https://signed/url" } as { ok: boolean; data?: string; code?: string } }));
vi.mock("@/app/[locale]/(site)/dashboard/patients/files-actions", () => ({
  listPatientFiles: async () => ({ ok: true, data: [{ name: "a.pdf", path: "d/p/a.pdf", mimeType: "application/pdf", size: 10, createdAt: "2026-01-01T00:00:00Z" }] }),
  openPatientFile: async () => h.openResult,
  deletePatientFile: async () => ({ ok: true, data: null }),
  hidePatientFile: async () => ({ ok: true, data: null }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { FilesTab } from "@/app/[locale]/(site)/dashboard/patients/[id]/FilesTab";

const show = () => render(
  <NextIntlClientProvider locale="en" messages={en}>
    <FilesTab patientId="p" doctorId="d" kind="files" isArchived={false} locale="en" />
  </NextIntlClientProvider>,
);

describe("FilesTab open", () => {
  const here = window.location.href;
  beforeEach(() => { h.openResult = { ok: true, data: "https://signed/url" }; });

  it("sends the new tab to the file, cuts its opener, and this tab stays", async () => {
    const tab = { opener: "x" as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    show();
    fireEvent.click(await screen.findByRole("button", { name: en.patientDetail.filesOpen }));
    await waitFor(() => expect(tab.location.href).toBe("https://signed/url"));
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(window.location.href).toBe(here);
  });

  it("a blocked pop-up says so and never navigates this tab", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    show();
    fireEvent.click(await screen.findByRole("button", { name: en.patientDetail.filesOpen }));
    expect(await screen.findByText(en.patientDetail.filesPopupBlocked)).toBeTruthy();
    expect(window.location.href).toBe(here);
  });

  it("a failed link closes the blank tab", async () => {
    h.openResult = { ok: false, code: "generic" };
    const tab = { opener: null, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    show();
    fireEvent.click(await screen.findByRole("button", { name: en.patientDetail.filesOpen }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.href).toBe("");
  });
});
