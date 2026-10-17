import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { mailboxLink } from "@/lib/mailboxLink";

// 01's "never lose a user at e-mail confirmation" (web half, PR A): the
// "Confirme seu e-mail" page after sign-up (the address, "Abrir e-mail" by
// domain, Reenviar, "E-mail errado? Corrigir" back to the form), and the
// forgot-password screen's resend line, shown to everyone, whose result
// never tells whether the address has an (unconfirmed) account.

const h = vi.hoisted(() => ({
  params: new URLSearchParams("c=BR"),
  signUp: vi.fn(),
  resetForEmail: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signUp: h.signUp, resetPasswordForEmail: h.resetForEmail, resend: h.resend },
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: h.resetForEmail } }),
}));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import ForgotPasswordPage from "@/app/[locale]/(site)/auth/forgot-password/page";

const wrap = (el: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{el}</NextIntlClientProvider>);
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("mailboxLink (the app's map, 13)", () => {
  it.each([
    ["ana@gmail.com", "https://mail.google.com"],
    ["Ana@Hotmail.com", "https://outlook.live.com/mail"],
    ["a@live.com", "https://outlook.live.com/mail"],
    ["a@yahoo.com.br", "https://mail.yahoo.com"],
    ["a@me.com", "https://www.icloud.com/mail"],
  ])("%s → %s", (email, url) => expect(mailboxLink(email)).toBe(url));
  it("an unknown domain (or no address): no button", () => {
    expect(mailboxLink("a@uol.com.br")).toBeNull();
    expect(mailboxLink("a@clinica.example")).toBeNull();
    expect(mailboxLink("")).toBeNull();
  });
});

async function signUp(email: string) {
  h.signUp.mockReset().mockResolvedValue({ data: { user: { id: "u-1", identities: [{}] } }, error: null });
  wrap(<SignupPage />);
  byId("signup-full-name").value = "Dra. Ana Souza";
  byId("signup-email").value = email;
  byId("signup-password").value = "longenough1";
  byId("signup-confirm-password").value = "longenough1";
  fireEvent.submit(byId("signup-email").form!);
  await screen.findByTestId("confirm-email-sent-to");
}

describe("Confirme seu e-mail (after sign-up)", () => {
  it("names the address, opens its mailbox, offers the resend", async () => {
    await signUp("ana@gmail.com");
    expect(screen.getByText(pt.auth.confirmEmail.title)).toBeInTheDocument();
    expect(screen.getByTestId("confirm-email-sent-to")).toHaveTextContent("Enviamos um link de confirmação para ana@gmail.com.");
    const open = screen.getByTestId("confirm-email-open");
    expect(open).toHaveAttribute("href", "https://mail.google.com");
    expect(open).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("resend-confirmation-button")).toBeInTheDocument();
  });

  it("an unknown provider: no 'Abrir e-mail'", async () => {
    await signUp("ana@clinica.example");
    expect(screen.queryByTestId("confirm-email-open")).toBeNull();
  });

  it("'E-mail errado? Corrigir' goes back to the form with the name and address kept", async () => {
    await signUp("ana@gmial.com");
    fireEvent.click(screen.getByTestId("confirm-email-fix"));
    expect(byId("signup-email").value).toBe("ana@gmial.com");
    expect(byId("signup-full-name").value).toBe("Dra. Ana Souza");
    expect(byId("signup-password").value).toBe("");
  });
});

describe("forgot password: the resend line, the same for every address", () => {
  async function sent() {
    h.resetForEmail.mockReset().mockResolvedValue({ error: null });
    wrap(<ForgotPasswordPage />);
    const email = document.querySelector("input[type=email]") as HTMLInputElement;
    email.value = "ana@x.example";
    fireEvent.submit(email.form!);
    await screen.findByTestId("forgot-unconfirmed");
  }

  it("shown after sending; a resend reads neutrally", async () => {
    await sent();
    expect(screen.getByText(pt.auth.confirmEmail.forgotQuestion)).toBeInTheDocument();
    h.resend.mockReset().mockResolvedValue({ error: null });
    fireEvent.click(screen.getByTestId("resend-confirmation-button"));
    await screen.findByText(pt.auth.resendConfirmation.neutralSent);
    expect(h.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "ana@x.example" }));
  });

  it("an error (e.g. a confirmed or unknown address) reads exactly the same", async () => {
    await sent();
    h.resend.mockReset().mockResolvedValue({ error: { code: "email_address_invalid", status: 400 } });
    fireEvent.click(screen.getByTestId("resend-confirmation-button"));
    await screen.findByText(pt.auth.resendConfirmation.neutralSent);
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("resend-confirmation-button")).toBeDisabled());
  });

  it("offline: says so, never sent (b9; nothing was sent)", async () => {
    await sent();
    h.resend.mockReset().mockResolvedValue({ error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } });
    fireEvent.click(screen.getByTestId("resend-confirmation-button"));
    await screen.findByRole("alert");
    expect(screen.queryByText(pt.auth.resendConfirmation.neutralSent)).toBeNull();
    expect(screen.getByTestId("resend-confirmation-button")).not.toBeDisabled();
  });

  it("only the rate limit says something else", async () => {
    await sent();
    h.resend.mockReset().mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    fireEvent.click(screen.getByTestId("resend-confirmation-button"));
    await screen.findByRole("alert");
    expect(screen.queryByText(pt.auth.resendConfirmation.neutralSent)).toBeNull();
  });
});
