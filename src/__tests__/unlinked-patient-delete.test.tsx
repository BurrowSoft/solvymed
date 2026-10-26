// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// B (01, 243): on "connect to a doctor", a patient with no doctor deletes the account, or is
// sent to ask for its deletion when a practice removed them (or data exists). 243's status
// RPC decides on load; the delete RPC is the backstop.

const h = vi.hoisted(() => ({
  status: { data: { can_delete: true, reason: null } as unknown, error: null as null | { message: string } },
  del: { data: { status: "deleted" } as unknown, error: null as null | { message: string } },
  calls: [] as string[],
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "pt-BR" }) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: h.signOut },
    rpc: async (fn: string) => {
      h.calls.push(fn);
      return fn === "delete_unlinked_patient_account_status" ? h.status : h.del;
    },
  }),
}));

const { AccountDeleteOption } = await import("@/components/AccountDeleteOption");
const T = pt.auth.inviteRequired;
const show = () => render(<NextIntlClientProvider locale="pt-BR" messages={pt}><AccountDeleteOption /></NextIntlClientProvider>);

describe("Excluir minha conta / Pedir exclusão da conta", () => {
  const original = window.location;
  const assign = vi.fn();
  beforeEach(() => {
    h.status = { data: { can_delete: true, reason: null }, error: null };
    h.del = { data: { status: "deleted" }, error: null };
    h.calls = [];
    h.signOut.mockClear();
    assign.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  it("can delete: confirm → deleted → a local sign-out, the cookies cleared, the landing note", async () => {
    document.cookie = "sb-test-auth-token=abc; path=/";
    show();
    fireEvent.click(await screen.findByTestId("delete-account"));
    expect(screen.getByTestId("delete-account-confirm")).toHaveTextContent(T.deleteConfirm);
    fireEvent.click(screen.getByTestId("delete-account-yes"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/?account_deleted=1"));
    expect(h.calls).toEqual(["delete_unlinked_patient_account_status", "delete_unlinked_patient_account"]);
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(document.cookie).not.toContain("sb-test-auth-token");
  });

  it("try_later (an invite-code guess in the last hour): offered; the delete says to try in an hour, below the buttons", async () => {
    h.status = { data: { can_delete: false, reason: "try_later" }, error: null };
    h.del = { data: null, error: { message: "try_later" } };
    show();
    fireEvent.click(await screen.findByTestId("delete-account"));
    fireEvent.click(screen.getByTestId("delete-account-yes"));
    const err = await screen.findByTestId("delete-account-error");
    expect(err).toHaveTextContent(pt.auth.completeAccount.cancelTryLater);
    expect(screen.getByTestId("delete-account-back").compareDocumentPosition(err) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["removed_by_practice", "has_data"])("%s: no delete, the link to ask for it", async (reason) => {
    h.status = { data: { can_delete: false, reason }, error: null };
    show();
    const link = await screen.findByTestId("request-deletion");
    expect(link).toHaveTextContent(T.requestDeletion);
    expect(link.getAttribute("href")).toBe("/pt-BR/account/delete");
    expect(screen.queryByTestId("delete-account")).toBeNull();
  });

  it.each([
    ["another reason", { data: { can_delete: false, reason: "not_unlinked_patient" }, error: null }],
    ["a failed read (before 243)", { data: null, error: { message: "function not found" } }],
  ])("%s: neither", async (_label, status) => {
    h.status = status as typeof h.status;
    show();
    await waitFor(() => expect(h.calls).toContain("delete_unlinked_patient_account_status"));
    expect(screen.queryByTestId("delete-account")).toBeNull();
    expect(screen.queryByTestId("request-deletion")).toBeNull();
  });

  it("the backstop: a refusal the status didn't predict → the generic error", async () => {
    h.del = { data: null, error: { message: "removed_by_practice" } };
    show();
    fireEvent.click(await screen.findByTestId("delete-account"));
    fireEvent.click(screen.getByTestId("delete-account-yes"));
    expect(await screen.findByTestId("delete-account-error")).toHaveTextContent(pt.auth.errors.generic);
  });
});
