import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Vitor (1.4.0): after "Entrar" the button went back from the spinner while
// the next page loaded, so he clicked again. It now stays loading until the
// page changes; only an error resets it, and a double-click submits once.

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  push: vi.fn(),
  sub: null as null | Record<string, unknown>,
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: h.signIn },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "professional" } }) }) }) }),
    rpc: async () => ({ data: h.sub ? [h.sub] : [], error: null }),
  }),
}));

import LoginPage from "@/app/[locale]/(site)/auth/login/page";

function fill() {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
  fireEvent.change(document.querySelector("input[type=email]")!, { target: { value: "a@b.co" } });
  fireEvent.change(document.querySelector("input[type=password]")!, { target: { value: "secret123" } });
  return document.querySelector("button[type=submit]") as HTMLButtonElement;
}

describe("login submit", () => {
  it("stays loading until the next page, and submits once on a double-click", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "u-1", user_metadata: {} } }, error: null });
    h.push.mockReset();
    const button = fill();
    fireEvent.submit(button.form!);
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/dashboard"));
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("a doctor whose trial ended goes straight to the paywall, never Home (build 25)", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "u-1", user_metadata: {} } }, error: null });
    h.push.mockReset();
    h.sub = { subscription_status: "trial", trial_ends_at: "2020-01-01T00:00:00Z", current_period_end: null, subscription_provider: null, subscription_id: null };
    const button = fill();
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/subscribe"));
    h.sub = null;
  });

  it("an error resets the button and allows another try", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials", status: 400 } });
    const button = fill();
    fireEvent.submit(button.form!);
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("/pt-BR/dashboard")).toBeNull();
  });
});

// Vitor, build 25 item 2: Tab from the email field must reach the password,
// then "Entrar"; "Esqueceu a senha?" comes after.
describe("login tab order", () => {
  it("email → password → submit → forgot password (document order, no tabindex tricks)", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <LoginPage />
      </NextIntlClientProvider>,
    );
    const focusable = Array.from(document.querySelectorAll("form input, form button, form a"))
      .map((el) => el.getAttribute("data-testid") ?? el.tagName);
    const order = ["login-email", "login-password", "login-submit", "login-forgot"].map((id) => focusable.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(document.querySelectorAll("form [tabindex]")).toHaveLength(0);
    expect(screen.getByLabelText(pt.auth.login.email)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(pt.auth.login.password)).toHaveAttribute("type", "password");
  });
});
