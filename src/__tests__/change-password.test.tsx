import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Alterar senha on the website (Help K2; the app's ChangePasswordModal):
// the current password checked by signing in, the new one saved, the other
// sessions ended.

const auth = {
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: () => null, turnstileEnabled: false }));

import { ChangePasswordPanel } from "@/app/[locale]/(site)/dashboard/settings/ChangePasswordPanel";

function fill(current: string, next: string, confirm = next) {
  render(<ChangePasswordPanel email="ana@example.com" locale="pt-BR" />);
  fireEvent.click(screen.getByRole("button", { name: "changePassword.title" }));
  fireEvent.change(screen.getByLabelText("changePassword.current"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("changePassword.new"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("changePassword.confirm"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "changePassword.title" }));
}

beforeEach(() => {
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe("ChangePasswordPanel", () => {
  it("checks the current password, saves the new one and ends the other sessions", async () => {
    fill("old-pass-1", "new-pass-22");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("changePassword.success"));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "old-pass-1", options: undefined });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-pass-22" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("a wrong current password: nothing changed", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", message: "Invalid login credentials" } });
    fill("wrong-pass", "new-pass-22");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("changePassword.currentWrong"));
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("checked before any request: mismatch, too short, the same as the current", () => {
    fill("old-pass-1", "new-pass-22", "new-pass-23");
    expect(screen.getByRole("alert")).toHaveTextContent("changePassword.mismatch");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("too short / unchanged", () => {
    fill("old-pass-1", "short");
    expect(screen.getByRole("alert")).toHaveTextContent('changePassword.tooShort{"min":8}');
  });

  it("the new password equal to the current one", () => {
    fill("same-pass-1", "same-pass-1");
    expect(screen.getByRole("alert")).toHaveTextContent("changePassword.sameError");
  });
});
