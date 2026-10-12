import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// 1.9.0 offline guard PR2a: with a weak connection (online, but the request
// gets no answer) a server action THROWS. Before, React 19 sent the throw
// to the error boundary (the whole page became the error screen) or a busy
// state stayed stuck. Now each place shows its own generic error, its
// buttons come back, and what was typed stays. One test per pattern.

// One stable t: a new function each render would re-run load effects forever.
const T = vi.hoisted(() => (k: string) => k);
vi.mock("next-intl", () => ({ useTranslations: () => T }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const NO_ANSWER = () => Promise.reject(new TypeError("Failed to fetch"));
const h = vi.hoisted(() => ({
  list: vi.fn(), remove: vi.fn(), markPaid: vi.fn(), keep: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/files-actions", () => ({
  listPatientFiles: (...a: unknown[]) => h.list(...a),
  openPatientFile: vi.fn(),
  deletePatientFile: (...a: unknown[]) => h.remove(...a),
  hidePatientFile: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/payments/actions", () => ({
  markPaid: (...a: unknown[]) => h.markPaid(...a), markUnpaid: vi.fn(), setPaymentAmount: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => ({
  keepInvitedPatient: (...a: unknown[]) => h.keep(...a), removeInvitedPatient: vi.fn(),
}));

import { FilesTab } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/FilesTab";
import { MarkPaidButton } from "@/app/[locale]/(site)/dashboard/(gated)/payments/PaymentsClient";
import { InvitedPatientsCard } from "@/app/[locale]/(site)/dashboard/(gated)/InvitedPatientsCard";

// What the app's global-error would show: the test fails if anything reaches it.
class Boundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? <p>ERROR SCREEN</p> : this.props.children; }
}
const show = (ui: ReactNode) => render(<Boundary>{ui}</Boundary>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

afterEach(() => vi.clearAllMocks());

describe("a list that loads (result-shaped action)", () => {
  it("no answer: the tab's error instead of loading forever", async () => {
    h.list.mockImplementation(NO_ANSWER);
    show(<FilesTab patientId="p" doctorId="d" kind="files" isArchived={false} locale="en" />);
    await settle();
    expect(screen.getByText("filesError")).toBeInTheDocument();
    expect(screen.queryByText("ERROR SCREEN")).toBeNull();
  });

  it("a remove without an answer: the error, and the buttons come back", async () => {
    h.list.mockResolvedValue({ ok: true, data: [{ name: "a.pdf", path: "d/p/a.pdf", mimeType: "application/pdf", size: 10, createdAt: new Date().toISOString() }] });
    h.remove.mockImplementation(NO_ANSWER);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    show(<FilesTab patientId="p" doctorId="d" kind="files" isArchived={false} locale="en" />);
    await settle();
    const remove = screen.getByRole("button", { name: "filesRemove" });
    await act(async () => { fireEvent.click(remove); });
    await settle();
    expect(screen.getByText("filesError")).toBeInTheDocument();
    expect((screen.getByRole("button", { name: "filesRemove" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("ERROR SCREEN")).toBeNull();
  });
});

describe("a money save inside a transition", () => {
  it("Mark paid without an answer: the generic error, the typed amount kept, no error screen", async () => {
    h.markPaid.mockImplementation(NO_ANSWER);
    show(<MarkPaidButton id="a1" />);
    fireEvent.click(screen.getByText("markPaid"));
    fireEvent.change(screen.getByPlaceholderText("amountPlaceholder"), { target: { value: "150,50" } });
    await act(async () => { fireEvent.click(screen.getByText("confirm")); });
    await settle();
    expect(h.markPaid).toHaveBeenCalledWith("a1", 150.5);
    expect(screen.getByText("errorGeneric")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("amountPlaceholder") as HTMLInputElement).value).toBe("150,50");
    expect(screen.queryByText("ERROR SCREEN")).toBeNull();
  });
});

describe("a row action with its own busy state", () => {
  it("Keep without an answer: the row's error, and its buttons come back", async () => {
    h.keep.mockImplementation(NO_ANSWER);
    show(<InvitedPatientsCard patients={[{ id: "p1", full_name: "Ana Nova", sameEmailAs: null }]} total={1} prefix="" />);
    await act(async () => { fireEvent.click(screen.getByText("invitedKeep")); });
    await settle();
    expect(screen.getByText("invitedError")).toBeInTheDocument();
    expect((screen.getByText("invitedKeep").closest("button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("ERROR SCREEN")).toBeNull();
  });
});
