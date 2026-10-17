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
  verifyOtp: vi.fn(),
  flags: { data: null, error: null } as { data: unknown; error: unknown },
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signUp: h.signUp, resetPasswordForEmail: h.resetForEmail, resend: h.resend, verifyOtp: h.verifyOtp },
    rpc: async (fn: string) => (fn === "get_public_flags" ? h.flags : { data: null, error: null }),
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

  it("right after sign-up the resend is already counting down (an e-mail just went out)", async () => {
    await signUp("ana@gmail.com");
    expect(screen.getByTestId("resend-confirmation-button")).toBeDisabled();
    expect(screen.getByTestId("resend-wait")).toHaveTextContent("60");
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

  it("the rate limit: just the wait (no red error, no 'sent'; ca/01)", async () => {
    await sent();
    h.resend.mockReset().mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    fireEvent.click(screen.getByTestId("resend-confirmation-button"));
    await screen.findByTestId("resend-wait");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(pt.auth.resendConfirmation.neutralSent)).toBeNull();
    expect(screen.getByTestId("resend-confirmation-button")).toBeDisabled();
  });
});

// PR B: the code, only while the shared switch confirm_by_code is on (the
// e-mail carries it then); anything uncertain is off.
describe("Confirme seu e-mail: the code (confirm_by_code)", () => {
  it.each([
    ["off", { data: [{ key: "confirm_by_code", enabled: false }], error: null }],
    ["missing", { data: [], error: null }],
    ["not deployed yet", { data: null, error: { code: "PGRST202" } }],
  ])("%s: link-only text, no code field", async (_, flags) => {
    h.flags = flags;
    await signUp("ana@gmail.com");
    await waitFor(() => expect(screen.getByTestId("confirm-email-sent-to")).toHaveTextContent("Enviamos um link de confirmação para ana@gmail.com."));
    expect(screen.queryByTestId("confirm-by-code")).toBeNull();
  });

  it("on: 'link and a code', the field; a good code confirms and routes like the link", async () => {
    h.flags = { data: [{ key: "confirm_by_code", enabled: true }], error: null };
    h.verifyOtp.mockReset().mockResolvedValue({ error: null });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ redirect: "/pt-BR/auth/professional-welcome" })));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
    await signUp("ana@gmail.com");
    await screen.findByTestId("confirm-by-code");
    expect(screen.getByTestId("confirm-email-sent-to")).toHaveTextContent("Enviamos um link e um código para ana@gmail.com.");
    fireEvent.change(byId("confirm-code"), { target: { value: "1234 5678" } });
    fireEvent.click(screen.getByTestId("confirm-code-submit"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/professional-welcome"));
    expect(h.verifyOtp).toHaveBeenCalledWith({ email: "ana@gmail.com", token: "12345678", type: "signup" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/after-verify", expect.objectContaining({ method: "POST", body: JSON.stringify({ locale: "pt-BR", type: "signup" }) }));
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("a wrong or expired code: says so, stays on the page", async () => {
    h.flags = { data: [{ key: "confirm_by_code", enabled: true }], error: null };
    h.verifyOtp.mockReset().mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    await signUp("ana@gmail.com");
    await screen.findByTestId("confirm-by-code");
    fireEvent.change(byId("confirm-code"), { target: { value: "00000000" } });
    fireEvent.click(screen.getByTestId("confirm-code-submit"));
    await screen.findByText(pt.auth.confirmEmail.codeInvalid);
    h.flags = { data: null, error: null };
  });
});
