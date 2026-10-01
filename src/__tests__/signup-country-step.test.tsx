import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Country first (Vitor, 2026-10-01): the signup starts with "Where are you?"
// (Brasil / ประเทศไทย + "Use SolvyMed in English"); the choice comes back as
// ?country= in its language; ← returns to the step. Invite and join-link
// signups skip it.

const h = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";

function show(query: string) {
  h.params = new URLSearchParams(query);
  h.push.mockReset();
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <SignupPage />
    </NextIntlClientProvider>,
  );
}

describe("signup: country first", () => {
  it("starts with the two countries; a tap continues in that country's language", () => {
    const { unmount } = show("");
    expect(screen.getByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-mail/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ประเทศไทย/ }));
    expect(h.push).toHaveBeenCalledWith("/th/auth/signup?country=TH");
    unmount();
  });

  it("\"Use SolvyMed in English\" continues in English", () => {
    const { unmount } = show("");
    fireEvent.click(screen.getByLabelText("Use SolvyMed in English"));
    fireEvent.click(screen.getByRole("button", { name: /Brasil/ }));
    expect(h.push).toHaveBeenCalledWith("/auth/signup?country=BR");
    unmount();
  });

  it("with a country: the form, and ← back to the step (no country field)", () => {
    const { unmount } = show("country=BR");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    const back = screen.getByRole("link", { name: pt.auth.signup.backToCountry });
    expect(back).toHaveAttribute("href", "/pt-BR/auth/signup");
    expect(document.querySelector("select#signup-country")).toBeNull();
    unmount();
  });

  it("a join link skips the step and offers only the English switch", () => {
    const { unmount } = show("join=ABC123");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    fireEvent.click(screen.getByLabelText("Use SolvyMed in English"));
    expect(h.push).toHaveBeenCalledWith("/auth/signup?join=ABC123&from=pt-BR");
    unmount();
  });
});
