import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// Invited patients (migration 145, Vitor via UX, 1 Oct): an invite-code
// signup is a patient record at once, badged "Novo, via convite"; the
// clinic keeps or removes it.
const h = vi.hoisted(() => ({ calls: [] as [string, string][], result: { ok: true } as { ok: boolean; code?: string } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => ({
  keepInvitedPatient: vi.fn(async (id: string) => { h.calls.push(["keep", id]); return h.result; }),
  removeInvitedPatient: vi.fn(async (id: string) => { h.calls.push(["remove", id]); return h.result; }),
}));

import { inviteErrorCode, isNewInvited } from "@/lib/invitedPatients";
import { InvitedPatientsCard } from "@/app/[locale]/(site)/dashboard/(gated)/InvitedPatientsCard";

beforeEach(() => { h.calls.length = 0; h.result = { ok: true }; });

describe("the badge rule", () => {
  it("invited, not reviewed, not archived", () => {
    expect(isNewInvited({ invited_via_code_at: "2026-10-01" })).toBe(true);
    expect(isNewInvited({ invited_via_code_at: "2026-10-01", invite_reviewed_at: "2026-10-02" })).toBe(false);
    expect(isNewInvited({ invited_via_code_at: "2026-10-01", archived_at: "2026-10-02" })).toBe(false);
    expect(isNewInvited({})).toBe(false);
  });
  it("the RPC errors as codes", () => {
    expect(inviteErrorCode("ERROR: patient_not_in_this_practice")).toBe("patient_not_in_this_practice");
    expect(inviteErrorCode("not_an_invited_patient")).toBe("not_an_invited_patient");
    expect(inviteErrorCode("boom")).toBe("generic");
  });
});

const PATIENTS = [
  { id: "p1", full_name: "Ana Nova", sameEmailAs: null },
  { id: "p2", full_name: "Bia Nova", sameEmailAs: { id: "p9", name: "Beatriz Antiga" } },
];

describe("the dashboard card", () => {
  it("counts, keeps, and the same-email prompt opens the merge pair", async () => {
    render(<InvitedPatientsCard patients={PATIENTS} total={2} prefix="/pt-BR" />);
    expect(screen.getByText('invitedTitle:{"n":2}')).toBeInTheDocument();
    const merge = screen.getByText('invitedSameEmail:{"name":"Beatriz Antiga"}').closest("a")!;
    expect(merge.getAttribute("href")).toBe("/pt-BR/dashboard/patients/p2?mergeWith=p9");
    await act(async () => { fireEvent.click(screen.getAllByText("invitedKeep")[0]); });
    expect(h.calls).toEqual([["keep", "p1"]]);
    expect(screen.queryByText("Ana Nova")).toBeNull();
    expect(screen.getByText('invitedTitle:{"n":1}')).toBeInTheDocument();
  });

  it("Remove asks first; cancelled → nothing; confirmed → removed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<InvitedPatientsCard patients={PATIENTS} total={2} prefix="" />);
    await act(async () => { fireEvent.click(screen.getAllByText("invitedRemove")[0]); });
    expect(h.calls).toEqual([]);
    expect(confirm).toHaveBeenCalledWith('invitedRemoveConfirm:{"name":"Ana Nova"}');
    await act(async () => { fireEvent.click(screen.getAllByText("invitedRemove")[0]); });
    expect(h.calls).toEqual([["remove", "p1"]]);
    confirm.mockRestore();
  });

  it("a failed answer keeps the row with an error", async () => {
    h.result = { ok: false, code: "generic" };
    render(<InvitedPatientsCard patients={PATIENTS} total={2} prefix="" />);
    await act(async () => { fireEvent.click(screen.getAllByText("invitedKeep")[0]); });
    expect(screen.getByText("Ana Nova")).toBeInTheDocument();
    expect(screen.getByText("invitedError")).toBeInTheDocument();
  });
});
