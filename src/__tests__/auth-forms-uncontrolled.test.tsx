import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
const byName = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;

describe("auth forms keep values React never saw", () => {
  it("sign-up: an autofilled email survives typing the passwords; all values are sent", async () => {
    h.params = new URLSearchParams("c=BR");
    h.signUp.mockReset().mockResolvedValue({ data: { user: { id: "u-1", identities: [{}] } }, error: null });
    const { unmount } = wrap(<SignupPage />);
    byName("full_name").value = "Dra. Ana Souza"; // autofill: no events
    byName("email").value = "ana@auto.fill";
    fireEvent.change(byName("password"), { target: { value: "longenough1" } });
    fireEvent.change(byName("confirm_password"), { target: { value: "longenough1" } });
    expect(byName("email").value).toBe("ana@auto.fill");
    fireEvent.submit(byName("email").form!);
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
    byName("full_name").value = "Ana";
    byName("email").value = "ana@auto.fill";
    byName("password").value = "longenough1";
    byName("confirm_password").value = "different22";
    fireEvent.submit(byName("email").form!);
    await waitFor(() => expect(document.querySelector(".error-banner")).toHaveTextContent(pt.auth.signup.passwordMismatch));
    expect(h.signUp).not.toHaveBeenCalled();
    expect(byName("email").value).toBe("ana@auto.fill");
    unmount();
  });

  it("forgot password: an autofilled email is the one the link is sent to", async () => {
    h.resetForEmail.mockReset().mockResolvedValue({ error: null });
    const { unmount } = wrap(<ForgotPasswordPage />);
    byName("email").value = "ana@auto.fill";
    fireEvent.submit(byName("email").form!);
    await waitFor(() => expect(h.resetForEmail).toHaveBeenCalledTimes(1));
    expect(h.resetForEmail.mock.calls[0][0]).toBe("ana@auto.fill");
    unmount();
  });

  it("reset password: a generated password survives typing the confirmation", async () => {
    window.location.hash = "#access_token=t&refresh_token=r&type=recovery";
    h.updateUser.mockReset().mockResolvedValue({ error: { message: "stop here" } });
    const { unmount } = wrap(<ResetPasswordPage />);
    await waitFor(() => expect(byName("new_password")).not.toBeNull());
    byName("new_password").value = "Generated-Pass-123"; // a password manager's suggestion
    fireEvent.change(byName("confirm_password"), { target: { value: "Generated-Pass-123" } });
    expect(byName("new_password").value).toBe("Generated-Pass-123");
    fireEvent.submit(byName("new_password").form!);
    await waitFor(() => expect(h.updateUser).toHaveBeenCalledTimes(1));
    expect(h.updateUser.mock.calls[0][0]).toEqual({ password: "Generated-Pass-123" });
    window.location.hash = "";
    unmount();
  });
});
