import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Country first (Vitor, 2026-10-01): the signup starts with "Where are you?"
// (Brasil / ประเทศไทย + "Use SolvyMed in English"); the choice comes back as
// ?c= in its language; ← returns to the step. Invite and join-link
// signups skip it.

const h = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import { CountryGuessProvider } from "@/app/[locale]/(site)/auth/signup/CountryGuess";
import type { CountryChoice } from "@/lib/signupCountry";

function show(query: string, guess: CountryChoice | null = null) {
  h.params = new URLSearchParams(query);
  h.push.mockReset();
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CountryGuessProvider guess={guess}>
        <SignupPage />
      </CountryGuessProvider>
    </NextIntlClientProvider>,
  );
}

const stepButtons = () => screen.getAllByRole("button").filter((b) => /Brasil|ประเทศไทย/.test(b.textContent ?? ""));

describe("signup: country first", () => {
  it("starts with the two countries; a tap continues in that country's language", () => {
    const { unmount } = show("");
    expect(screen.getByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-mail/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ประเทศไทย/ }));
    expect(h.push).toHaveBeenCalledWith("/th/auth/signup?c=TH");
    unmount();
  });

  it("\"Use SolvyMed in English\" continues in English", () => {
    const { unmount } = show("");
    fireEvent.click(screen.getByLabelText("Use SolvyMed in English"));
    fireEvent.click(screen.getByRole("button", { name: /Brasil/ }));
    expect(h.push).toHaveBeenCalledWith("/auth/signup?c=BR");
    unmount();
  });

  it("with a country: the form, and ← back to the step (no country field)", () => {
    const { unmount } = show("c=BR");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    const back = screen.getByRole("link", { name: pt.auth.signup.backToCountry });
    expect(back).toHaveAttribute("href", "/pt-BR/auth/signup");
    expect(document.querySelector("select#signup-country")).toBeNull();
    unmount();
  });

  it("a suggested country goes first in the primary style; nothing is chosen or stored until a tap", () => {
    document.cookie = "solvymed_signup_country=; path=/; max-age=0";
    const { unmount } = show("", "TH");
    const [first, second] = stepButtons();
    expect(first).toHaveTextContent("ประเทศไทย");
    expect(first).toHaveAttribute("data-suggested", "true");
    expect(first.className).toContain("bg-teal-600");
    expect(second).toHaveTextContent("Brasil");
    expect(second).not.toHaveAttribute("data-suggested");
    expect(second.className).toContain("bg-white");
    expect(h.push).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("solvymed_signup_country=TH");
    // The other country is still one tap.
    fireEvent.click(second);
    expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/signup?c=BR");
    expect(document.cookie).toContain("solvymed_signup_country=BR");
    unmount();
  });

  it("no suggestion: as before, Brasil first and both outlined", () => {
    const { unmount } = show("");
    const buttons = stepButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(["🇧🇷Brasil", "🇹🇭ประเทศไทย"]);
    expect(buttons.every((b) => !b.hasAttribute("data-suggested") && b.className.includes("bg-white"))).toBe(true);
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
