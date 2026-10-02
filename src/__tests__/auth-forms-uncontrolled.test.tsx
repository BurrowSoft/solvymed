import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// e7 (after #332): sign-up, forgot password and reset password had the same
// controlled fields as login. A value React never saw (a password manager's
// autofill, typing before hydration) was wiped by the next re-render, e.g.
// a keystroke in another field. Each page now reads its fields from the
// form; these fill one field with no input event, type in another, submit,
// and check both values are sent and the first is still shown.

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  signUp: vi.fn(),
  resetForEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: h.signUp,
      resetPasswordForEmail: h.resetForEmail,
      updateUser: h.updateUser,
      setSession: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// Forgot password builds its own implicit-flow client.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: h.resetForEmail } }),
}));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import ForgotPasswordPage from "@/app/[locale]/(site)/auth/forgot-password/page";
import ResetPasswordPage from "@/app/[locale]/(site)/auth/reset-password/page";

const wrap = (el: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{el}</NextIntlClientProvider>);
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("auth forms keep values React never saw", () => {
  it("sign-up: an autofilled email survives typing the passwords; all values are sent", async () => {
    h.params = new URLSearchParams("c=BR");
    h.signUp.mockReset().mockResolvedValue({ data: { user: { id: "u-1", identities: [{}] } }, error: null });
    const { unmount } = wrap(<SignupPage />);
    byId("signup-full-name").value = "Dra. Ana Souza"; // autofill: no events
    byId("signup-email").value = "ana@auto.fill";
    fireEvent.change(byId("signup-password"), { target: { value: "longenough1" } });
    fireEvent.change(byId("signup-confirm-password"), { target: { value: "longenough1" } });
    expect(byId("signup-email").value).toBe("ana@auto.fill");
    fireEvent.submit(byId("signup-email").form!);
    await waitFor(() => expect(h.signUp).toHaveBeenCalledTimes(1));
    const arg = h.signUp.mock.calls[0][0];
    expect(arg).toMatchObject({ email: "ana@auto.fill", password: "longenough1" });
    expect(arg.options.data.full_name).toBe("Dra. Ana Souza");
    unmount();
  });

  it("sign-up: a mismatch is still caught from the fields' own values", async () => {
    h.params = new URLSearchParams("c=BR");
    h.signUp.mockReset();
    const { unmount } = wrap(<SignupPage />);
    byId("signup-full-name").value = "Ana";
    byId("signup-email").value = "ana@auto.fill";
    byId("signup-password").value = "longenough1";
    byId("signup-confirm-password").value = "different22";
    fireEvent.submit(byId("signup-email").form!);
    await waitFor(() => expect(document.querySelector(".error-banner")).toHaveTextContent(pt.auth.signup.passwordMismatch));
    expect(h.signUp).not.toHaveBeenCalled();
    expect(byId("signup-email").value).toBe("ana@auto.fill");
    unmount();
  });

  it("sign-up as a patient: the typed code is normalised and read through form=\"signup-form\"", async () => {
    h.params = new URLSearchParams("c=BR");
    h.signUp.mockReset().mockResolvedValue({ data: { user: { id: "u-2", identities: [{}] } }, error: null });
    const { unmount } = wrap(<SignupPage />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.auth.signup.rolePatient) }));
    const code = byId("signup-invite-code");
    expect(code.form).toBe(byId("signup-email").form); // outside the <form>, joined by its form attribute
    fireEvent.input(code, { target: { value: "ab-12c" } });
    expect(code.value).toBe("AB12C");
    // Switching to doctor and back keeps the typed code.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.auth.signup.roleDoctor) }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.auth.signup.rolePatient) }));
    expect(byId("signup-invite-code").value).toBe("AB12C");
    byId("signup-full-name").value = "Paciente";
    byId("signup-email").value = "pac@auto.fill";
    byId("signup-password").value = "longenough1";
    byId("signup-confirm-password").value = "longenough1";
    fireEvent.submit(byId("signup-email").form!);
    await waitFor(() => expect(h.signUp).toHaveBeenCalledTimes(1));
    expect(h.signUp.mock.calls[0][0].options.data).toMatchObject({ role: "patient", invite_code: "AB12C" });
    unmount();
  });

  it("forgot password: an autofilled email is the one the link is sent to", async () => {
    h.resetForEmail.mockReset().mockResolvedValue({ error: null });
    const { unmount } = wrap(<ForgotPasswordPage />);
    byId("forgot-email").value = "ana@auto.fill";
    fireEvent.submit(byId("forgot-email").form!);
    await waitFor(() => expect(h.resetForEmail).toHaveBeenCalledTimes(1));
    expect(h.resetForEmail.mock.calls[0][0]).toBe("ana@auto.fill");
    unmount();
  });

  it("reset password: a generated password survives typing the confirmation", async () => {
    window.location.hash = "#access_token=t&refresh_token=r&type=recovery";
    h.updateUser.mockReset().mockResolvedValue({ error: { message: "stop here" } });
    const { unmount } = wrap(<ResetPasswordPage />);
    await waitFor(() => expect(byId("reset-new-password")).not.toBeNull());
    byId("reset-new-password").value = "Generated-Pass-123"; // a password manager's suggestion
    fireEvent.change(byId("reset-confirm-password"), { target: { value: "Generated-Pass-123" } });
    expect(byId("reset-new-password").value).toBe("Generated-Pass-123");
    fireEvent.submit(byId("reset-new-password").form!);
    await waitFor(() => expect(h.updateUser).toHaveBeenCalledTimes(1));
    expect(h.updateUser.mock.calls[0][0]).toEqual({ password: "Generated-Pass-123" });
    window.location.hash = "";
    unmount();
  });

  it("no form can put a value in a URL: method post, no input has a name (3e, 9a)", async () => {
    window.location.hash = "#access_token=t&refresh_token=r&type=recovery";
    h.params = new URLSearchParams("c=BR");
    for (const Page of [SignupPage, ForgotPasswordPage, ResetPasswordPage]) {
      const { unmount } = wrap(<Page />);
      await waitFor(() => expect(document.querySelector("form")).not.toBeNull());
      const forms = Array.from(document.querySelectorAll("form"));
      for (const form of forms) {
        expect(form.method).toBe("post");
        expect([...new FormData(form).keys()]).toEqual([]);
      }
      expect(document.querySelectorAll("input[name]")).toHaveLength(0);
      unmount();
    }
    window.location.hash = "";
  });
});
