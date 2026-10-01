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
